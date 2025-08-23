import { GoogleGenAI } from "@google/genai";
import { Character, Message, ApiConfig } from "../types";
import { logger } from "./loggingService";

// --- Gemini Client Setup ---
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  const errorMsg = "API_KEY environment variable not set. The application will not be able to connect to the Gemini API by default.";
  logger.error(errorMsg);
}
const defaultAi = new GoogleGenAI({ apiKey: API_KEY! });

const getAiClient = (apiKey?: string): GoogleGenAI => {
    if (apiKey) {
        logger.debug("Creating a new Gemini client with a custom API key.");
        return new GoogleGenAI({ apiKey });
    }
    return defaultAi;
}

// --- OpenAI Compatible Service ---

/**
 * A wrapper for fetch that includes a retry mechanism with exponential backoff.
 * This is useful for handling rate limiting (429) errors and transient network issues.
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
                    // Don't retry on the last attempt, just return the response to be handled by the caller.
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
            ...history.map(msg => ({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content }))
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

const generateOpenAIImage = async (prompt: string, config: { [key: string]: any }): Promise<string> => {
    const response = await fetchWithRetry(config.apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey || 'ollama'}`,
        },
        body: JSON.stringify({
            prompt: prompt,
            model: config.model || 'dall-e-3',
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
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

const streamGeminiChatResponse = async (
    character: Character,
    history: Message[],
    onChunk: (chunk: string) => void
): Promise<void> => {
    const customApiKey = character.apiConfig?.service === 'gemini' ? character.apiConfig.apiKey : undefined;
     if (customApiKey) {
        logger.log(`Using custom Gemini API key for character: ${character.name}`);
    }

    const ai = getAiClient(customApiKey);

    const systemInstruction = `You are an AI character named ${character.name}.
Description: ${character.description}
Personality: ${character.personality}

Engage in conversation based on this persona. Do not break character. Respond to the user's last message.`;
    
    const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
    }));

    try {
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
        onChunk("Sorry, I encountered an error. Please try again.");
    }
};

const generateGeminiImage = async (prompt: string, apiKey?: string): Promise<string> => {
    const ai = getAiClient(apiKey);
    const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: prompt,
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
    history: Message[],
    onChunk: (chunk: string) => void
): Promise<void> => {
    const config = character.apiConfig || { service: 'default' };
    const systemInstruction = `You are an AI character named ${character.name}.\nDescription: ${character.description}\nPersonality: ${character.personality}\n\nEngage in conversation based on this persona. Do not break character. Respond to the user's last message.`;

    if (config.service === 'openai') {
        logger.log(`Using OpenAI-compatible API for character: ${character.name}`, { endpoint: config.apiEndpoint, model: config.model });
        if (!config.apiEndpoint) {
            onChunk("Error: OpenAI-compatible API endpoint is not configured for this character.");
            return;
        }
        await streamOpenAIChatResponse(config, systemInstruction, history, onChunk);
    } else { // Defaulting to Gemini
        logger.log(`Using Gemini API for character: ${character.name}`);
        await streamGeminiChatResponse(character, history, onChunk);
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
            return await generateGeminiImage(prompt, settings?.apiKey);
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