import { Character, CryptoKeys } from '../types';
import { logger } from './loggingService';
import { createCanonicalString, verify, importKey } from './cryptoService';

// --- Utilities ---

/**
 * Fetches an image from a URL and converts it to a base64 data string.
 * Handles various image types and CORS issues by fetching through the app's context.
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        logger.warn(`Could not convert image URL to base64. It might be a CORS issue or an invalid URL. URL: ${url}`, error);
        return ''; // Return empty string or a default placeholder if needed
    }
};

const getBase64FromDataUrl = (dataUrl: string): string => {
    return dataUrl.substring(dataUrl.indexOf(',') + 1);
}

// --- Conversion Logic ---

/**
 * Converts an AI Nexus character object to a Character Card v2 compatible object.
 * It embeds AI Nexus specific data in a private `_aiNexusData` block for lossless re-import.
 */
export const nexusToV2 = async (character: Character): Promise<any> => {
    logger.log(`Starting character export for: ${character.name}`);
    
    let char_persona = `## ${character.name}\n`;
    if (character.description) char_persona += `${character.description}\n\n`;

    char_persona += "### Physical Appearance\n";
    char_persona += `${character.physicalAppearance || 'Not specified'}\n\n`;
    
    char_persona += "### Personality Traits\n";
    char_persona += `${character.personalityTraits || 'Not specified'}\n\n`;

    if (character.lore && character.lore.length > 0) {
        char_persona += "### Lore\n";
        char_persona += character.lore.map(fact => `- ${fact}`).join('\n') + '\n\n';
    }

    const avatarDataUrl = character.avatarUrl.startsWith('data:image') 
        ? character.avatarUrl 
        : await imageUrlToBase64(character.avatarUrl);
    
    const base64Avatar = avatarDataUrl ? getBase64FromDataUrl(avatarDataUrl) : '';

    const cardData = {
        name: character.name,
        description: character.description,
        personality: character.personality,
        first_mes: '', 
        mes_example: '',
        scenario: '',
        char_persona: char_persona.trim(),
        char_greeting: '',
        avatar: base64Avatar,
        // Private block for perfect re-import into AI Nexus
        _aiNexusData: {
            version: '1.1',
            id: character.id,
            name: character.name,
            description: character.description,
            personality: character.personality,
            avatarUrl: character.avatarUrl,
            tags: character.tags,
            createdAt: character.createdAt,
            physicalAppearance: character.physicalAppearance,
            personalityTraits: character.personalityTraits,
            lore: character.lore,
            memory: character.memory,
            apiConfig: character.apiConfig,
            // New security fields
            keys: { publicKey: character.keys?.publicKey }, // Only export public key
            signature: character.signature,
            userPublicKeyJwk: character.userPublicKeyJwk
        }
    };
    
    return {
        spec: 'chara_card_v2',
        spec_version: '1.0',
        data: cardData
    };
};

/**
 * Converts a Character Card v2 compatible object into an AI Nexus Character.
 * It prioritizes the private `_aiNexusData` block if it exists.
 */
export const v2ToNexus = (card: any): Character | null => {
    const data = card.data || card; 
    
    if (!data || !data.name) {
        return null; // Not a valid card
    }

    // --- Case 1: Perfect re-import from an AI Nexus-exported card ---
    if (data._aiNexusData) {
        logger.log(`Importing character "${data.name}" using _aiNexusData block.`);
        const nexusData = data._aiNexusData;
        const character: Character = {
            ...nexusData,
            id: crypto.randomUUID(),
            keys: undefined, // Regenerate keys on next save to ensure a new private key
        };
        return character;
    }

    // --- Case 2: Best-effort import from a standard V2/TavernAI card ---
    logger.log(`Importing standard character card: ${data.name}`);
    
    const avatarUrl = data.avatar ? `data:image/png;base64,${data.avatar}` : '';
    
    let personality = data.personality || '';
    if (data.char_persona) {
        personality += `\n\n${data.char_persona}`;
    }
    if(data.mes_example) {
        personality += `\n\nExample Messages:\n${data.mes_example}`;
    }

    const newCharacter: Character = {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description || '',
        personality: personality.trim(),
        avatarUrl: avatarUrl,
        tags: [],
        createdAt: new Date().toISOString(),
        physicalAppearance: '', 
        personalityTraits: '',
        lore: [],
        memory: `Memory of ${data.name} begins here.`,
    };

    return newCharacter;
};