export default async function handler(req, res) {
    // 1. Only allow POST requests from our frontend
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Get the research question (prompt) from the frontend
    const { promptText } = req.body;
    if (!promptText) {
        return res.status(400).json({ error: 'Missing promptText' });
    }

    // 3. Securely access your API key from Vercel's Environment Variables
    // This keeps it hidden from hackers!
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured on server' });
    }

    // 4. The System Prompt (Hidden on the backend so users can't mess with it)
    const systemPrompt = `You are an expert clinical medical librarian and systematic review methodologist. 
    Analyze the user's research question and extract PICO elements.
    
    CRITICAL INSTRUCTIONS:
    1. For EACH concept, suggest terms. You MUST separate MeSH (for PubMed) and Emtree (for Embase) from free-text keywords.
    2. Keywords MUST include: spelling variants, acronyms, and BOTH generic and brand drug names. Provide truncation suggestions (using *) where appropriate.
    3. Rationale: Briefly explain WHY a term is included (e.g., "Official MeSH term", "Brand name for...", "UK spelling variant", "Common abbreviation").
    4. Quality Audit: Provide 'strengths' (e.g., good use of synonyms) and critical 'warnings' (e.g., "Including 'Outcome' terms severely restricts sensitivity. Consider removing.").
    
    JSON structure must strictly match the schema provided.`;

    const geminiPayload = {
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    pico: {
                        type: "OBJECT",
                        properties: {
                            population: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, vocab: { type: "STRING", enum: ["mesh", "emtree", "keyword"] }, reason: { type: "STRING" } } } },
                            intervention: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, vocab: { type: "STRING", enum: ["mesh", "emtree", "keyword"] }, reason: { type: "STRING" } } } },
                            comparison: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, vocab: { type: "STRING", enum: ["mesh", "emtree", "keyword"] }, reason: { type: "STRING" } } } },
                            outcome: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, vocab: { type: "STRING", enum: ["mesh", "emtree", "keyword"] }, reason: { type: "STRING" } } } }
                        }
                    },
                    qualityCheck: {
                        type: "OBJECT",
                        properties: {
                            strengths: { type: "ARRAY", items: { type: "STRING" } },
                            warnings: { type: "ARRAY", items: { type: "STRING" } }
                        }
                    },
                    explanation: { type: "STRING" }
                }
            }
        }
    };

    // We use the Gemini 1.5 Flash model for fast, structured responses
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        // 5. Call the Google Gemini API securely from the server
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error?.message || 'Gemini API Error');
        }

        // 6. Send the clean data back to your frontend
        res.status(200).json(result);

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: 'Failed to communicate with AI endpoint.' });
    }
}