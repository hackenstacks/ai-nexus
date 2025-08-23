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
