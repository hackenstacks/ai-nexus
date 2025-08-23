import { GoogleGenAI } from "@google/genai";
import { Character, Message } from "../types";

// Ensure API_KEY is set in the environment variables
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  // In a real app, you might want to show an error message to the user.
  // For this context, we will throw an error to make it clear during development.
  console.error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY! });

export const streamChatResponse = async (
  character: Character,
  history: Message[],
  onChunk: (chunk: string) => void
): Promise<void> => {
  
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
        config: {
            systemInstruction: systemInstruction,
        }
    });

    for await (const chunk of responseStream) {
      onChunk(chunk.text);
    }
  } catch (error) {
    console.error("Error generating content:", error);
    onChunk("Sorry, I encountered an error. Please try again.");
  }
};

/**
 * Generates content using the gemini-2.5-flash model.
 * Used by plugins for tasks like summarization.
 */
export const generateContent = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error in generateContent:", error);
    throw error;
  }
};

/**
 * Generates an image from a text prompt using the imagen-3.0-generate-002 model.
 * Returns a Base64 encoded string of the generated image.
 */
export const generateImageFromPrompt = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png', // Using PNG for better quality
            aspectRatio: '1:1',
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64ImageBytes}`;
    }
    throw new Error("No image was generated.");
  } catch (error) {
    console.error("Error in generateImageFromPrompt:", error);
    throw error;
  }
};
