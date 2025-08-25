import { GoogleGenAI } from "@google/genai";
import { Character, Message, ApiConfig } from "../types";
import { logger } from "./loggingService";

// --- Gemini Client Setup ---
const API_KEY = process.env.API_KEY;
let defaultAi: GoogleGenAI | null = null;

if (API_KEY) {
  defaultAi = new GoogleGenAI({ apiKey: API_KEY });
} else {
  const errorMsg = "API_KEY environment variable not set. The application will not be able to connect to the Gemini API by default.";
  logger.warn(errorMsg);
}

const getAiClient = (apiKey?: string): GoogleGenAI => {
    if (apiKey) {
        logger.debug("Creating a new Gemini client with a custom API key.");
        return new GoogleGenAI({ apiKey });
    }
    if (defaultAi) {
        return defaultAi;
    }
    throw new Error("Default Gemini API key not configured. Please set a custom API key for the character or plugin.");
}

// --- OpenAI Compatible Service ---

/**
 * A wrapper for fetch that includes a retry mechanism with exponential backoff.
 * This is useful for handling rate limiting (429) and transient network issues.
 */
const fetchWithRetry = async (
    url: RequestInfo, 
    options: RequestInit, 
    maxRetries = 3, 
    initialDelay = 2000
): Promise<Response> => {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await fetch(url, options);

            // If we get a rate limit error, wait and retry
            if (response.status === 429) {
                if (attempt + 1 >= maxRetries) {
                    logger.warn(`API rate limit exceeded. All ${maxRetries} retries failed. Returning final error response to be handled by caller.`);
                    return response;
                }
                const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
                logger.warn(`API rate limit exceeded. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
                continue;
            }

            // For any other response (ok or not), return it immediately. The caller will handle it.
            return response;

        } catch (error) {
            // This catches network errors. We should retry on these.
             if (attempt + 1 >= maxRetries) {
                logger.error(`API request failed after ${maxRetries} attempts due to network errors.`, error);
                throw error; // Rethrow the last error if all retries fail
            }
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            logger.warn(`Fetch failed due to a network error. Retrying in ${Math.round(delay / 1000)}s...`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
    // This should not be reached if the loop is correct, but for typescript's sake.
    throw new Error(`API request failed to complete after ${maxRetries} attempts.`);
};


const streamOpenAIChatResponse = async (
    config: ApiConfig,
    systemInstruction: string,
    history: Message[],
    onChunk: (chunk: string) => void
): Promise<void> => {
    try {
        const messages = [
            { role: "system", content: systemInstruction },
            ...history
                .filter(msg => msg.role === 'user' || msg.role === 'model' || msg.role === 'narrator')
                .map(msg => {
                    const role = msg.role === 'model' ? 'assistant' : 'user';
                    const content = msg.role === 'narrator' ? `[NARRATOR]: ${msg.content}` : msg.content;
                    return { role, content };
                })
        ];

        const response = await fetchWithRetry(config.apiEndpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey || 'ollama'}`,
            },
            body: JSON.stringify({
                model: config.model || 'default',
                messages: messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 429) {
                let errorMessage = `The API is rate-limiting requests.`;
                try {
                    const parsedError = JSON.parse(errorBody);
                    if (parsedError.message) {
                        errorMessage += ` Message: ${parsedError.message}`;
                    }
                } catch (e) {
                    errorMessage += ` Details: ${errorBody}`;
                }
                logger.error("OpenAI-compatible stream failed due to rate limiting after all retries.", { status: response.status, body: errorBody });
                throw new Error(errorMessage);
            }
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Could not get response reader.");

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        return;
                    }
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const chunk = parsed.choices[0]?.delta?.content;
                        if (chunk) {
                            onChunk(chunk);
                        }
                    } catch (e) {
                        logger.warn("Failed to parse stream chunk JSON:", jsonStr);
                    }
                }
            }
        }
    } catch (error) {
        logger.error("Error in OpenAI-compatible stream:", error);
        onChunk(`Sorry, I encountered an error with the OpenAI-compatible API: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const buildImagePrompt = (prompt: string, settings: { [key: string]: any }): string => {
    let stylePrompt = '';
    if (settings.style && settings.style !== 'Default (None)') {
        if (settings.style === 'Custom' && settings.customStylePrompt) {
            stylePrompt = `${settings.customStylePrompt}, `;
        } else if (settings.style !== 'Custom') {
             stylePrompt = `${settings.style} style, `;
        }
    }
    const negativePrompt = settings.negativePrompt ? `. Negative prompt: ${settings.negativePrompt}` : '';
    return `${stylePrompt}${prompt}${negativePrompt}`;
};

const generateOpenAIImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const fullPrompt = buildImagePrompt(prompt, settings);
    logger.log("Generating OpenAI image with full prompt:", { fullPrompt });

    const response = await fetchWithRetry(settings.apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey || 'ollama'}`,
        },
        body: JSON.stringify({
            prompt: fullPrompt,
            model: settings.model || 'dall-e-3',
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 429) {
            let errorMessage = `The API is rate-limiting image generation requests.`;
            try {
                const parsedError = JSON.parse(errorBody);
                if (parsedError.message) {
                    errorMessage += ` Message: ${parsedError.message}`;
                }
            } catch (e) {
                errorMessage += ` Details: ${errorBody}`;
            }
            logger.error("OpenAI-compatible image generation failed due to rate limiting after all retries.", { status: response.status, body: errorBody });
            throw new Error(errorMessage);
        }
        throw new Error(`Image generation failed with status ${response.status}: ${errorBody}`);
    }

    const json = await response.json();
    const base64Image = json.data?.[0]?.b64_json;

    if (!base64Image) {
        throw new Error("API response did not contain image data.");
    }
    return `data:image/png;base64,${base64Image}`;
};

// --- Gemini Service ---

const buildSystemInstruction = (character: Character, allParticipants: Character[] = []): string => {
    let instruction = `You are an AI character named ${character.name}.\n\n`;

    if (allParticipants.length > 1) {
        const otherParticipantNames = allParticipants
            .filter(p => p.id !== character.id)
            .map(p => p.name)
            .join(', ');
        instruction += `You are in a group conversation with: ${otherParticipantNames}. Interact with them naturally based on your persona.\n\n`;
    }

    instruction += "== CORE IDENTITY ==\n";
    if (character.description) instruction += `Description: ${character.description}\n`;
    if (character.physicalAppearance) instruction += `Physical Appearance: ${character.physicalAppearance}\n`;
    if (character.personalityTraits) instruction += `Personality Traits: ${character.personalityTraits}\n`;
    instruction += "\n";

    if (character.personality) {
        instruction += "== ROLE INSTRUCTION ==\n";
        instruction += `${character.personality}\n\n`;
    }

    if (character.memory) {
        instruction += "== MEMORY (Recent Events) ==\n";
        instruction += `${character.memory}\n\n`;
    }

    if (character.lore && character.lore.length > 0 && character.lore.some(l => l.trim() !== '')) {
        instruction += "== LORE (Key Facts) ==\n";
        instruction += character.lore.filter(fact => fact.trim() !== '').map(fact => `- ${fact}`).join('\n') + '\n\n';
    }
    
    instruction += "Engage in conversation based on this complete persona. Do not break character. Respond to the user's last message.";

    return instruction;
};

const streamGeminiChatResponse = async (
    character: Character,
    systemInstruction: string,
    history: Message[],
    onChunk: (chunk: string) => void
): Promise<void> => {
    try {
        const customApiKey = character.apiConfig?.service === 'gemini' ? character.apiConfig.apiKey : undefined;
        if (customApiKey) {
            logger.log(`Using custom Gemini API key for character: ${character.name}`);
        }

        const ai = getAiClient(customApiKey);
        
        const contents = history
            .filter(msg => msg.role === 'user' || msg.role === 'model' || msg.role === 'narrator')
            .map(msg => {
                const role = msg.role === 'model' ? 'model' : 'user';
                const content = msg.role === 'narrator' ? `[NARRATOR]: ${msg.content}` : msg.content;
                return {
                    role: role,
                    parts: [{ text: content }]
                };
            });

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: { systemInstruction: systemInstruction }
        });

        for await (const chunk of responseStream) {
            onChunk(chunk.text);
        }
    } catch (error) {
        logger.error("Error generating Gemini content stream:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        onChunk(`Sorry, an error occurred with the Gemini API: ${errorMessage}`);
    }
};

const generateGeminiImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const ai = getAiClient(settings?.apiKey);
    const fullPrompt = buildImagePrompt(prompt, settings);
    logger.log("Generating Gemini image with full prompt:", { fullPrompt });

    const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: fullPrompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '1:1',
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
        return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
    }
    throw new Error("No image was generated by Gemini.");
};


// --- Orchestrator Functions ---

export const streamChatResponse = async (
    character: Character,
    allParticipants: Character[],
    history: Message[],
    onChunk: (chunk: string) => void,
    systemInstructionOverride?: string
): Promise<void> => {
    const config = character.apiConfig || { service: 'default' };
    let systemInstruction = buildSystemInstruction(character, allParticipants);

    if (systemInstructionOverride) {
        systemInstruction += `\n\n[ADDITIONAL INSTRUCTIONS FOR THIS RESPONSE ONLY]:\n${systemInstructionOverride}`;
        logger.log("Applying system instruction override for next response.");
    }

    if (config.service === 'openai') {
        logger.log(`Using OpenAI-compatible API for character: ${character.name}`, { endpoint: config.apiEndpoint, model: config.model });
        if (!config.apiEndpoint) {
            onChunk("Error: OpenAI-compatible API endpoint is not configured for this character.");
            return;
        }
        await streamOpenAIChatResponse(config, systemInstruction, history, onChunk);
    } else { // Defaulting to Gemini
        logger.log(`Using Gemini API for character: ${character.name}`);
        await streamGeminiChatResponse(character, systemInstruction, history, onChunk);
    }
};

export const generateImageFromPrompt = async (prompt: string, settings?: { [key: string]: any }): Promise<string> => {
    try {
        const service = settings?.service || 'default';
        if (service === 'openai') {
            logger.log("Using OpenAI-compatible API for image generation.", { endpoint: settings?.apiEndpoint, model: settings?.model });
            if (!settings?.apiEndpoint) {
                throw new Error("OpenAI-compatible API endpoint is not configured for the image generator plugin.");
            }
            // The endpoint for image generation is often different from chat, e.g. /v1/images/generations
            const endpoint = settings.apiEndpoint.endsWith('/v1/images/generations') 
                ? settings.apiEndpoint 
                : `${settings.apiEndpoint.replace(/\/$/, '')}/v1/images/generations`;

            return await generateOpenAIImage(prompt, { ...settings, apiEndpoint: endpoint });
        } else {
            logger.log("Using Gemini API for image generation.");
            return await generateGeminiImage(prompt, settings || {});
        }
    } catch (error) {
        logger.error("Error in generateImageFromPrompt:", error);
        throw error;
    }
};

export const generateContent = async (prompt: string, apiKey?: string): Promise<string> => {
  try {
    const ai = getAiClient(apiKey);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
  } catch (error) {
    logger.error("Error in generateContent:", error);
    throw error;
  }
};

export const streamGenericResponse = async (
    systemInstruction: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    apiKey?: string
): Promise<void> => {
    try {
        const ai = getAiClient(apiKey);
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction: systemInstruction }
        });

        for await (const chunk of responseStream) {
            onChunk(chunk.text);
        }
    } catch (error) {
        logger.error("Error generating generic content stream:", error);
        onChunk("Sorry, an error occurred while responding.");
    }
};