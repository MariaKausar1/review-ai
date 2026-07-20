export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        // Get research question from frontend
        const { promptText } = req.body;

        if (!promptText) {
            return res.status(400).json({
                error: 'Missing promptText'
            });
        }

        // Get API key from Vercel Environment Variables
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: 'GEMINI_API_KEY is not configured in Vercel'
            });
        }

        // System instructions
        const systemPrompt = `
You are an expert clinical medical librarian and systematic review methodologist.

Analyze the user's research question and extract PICO elements.

For each concept:
1. Suggest MeSH terms for PubMed.
2. Suggest Emtree terms for Embase.
3. Suggest free-text keywords.
4. Include spelling variants, acronyms, generic and brand drug names where relevant.
5. Include truncation suggestions where appropriate.
6. Give a short rationale for every suggested term.

Also perform a quality audit:
- Identify methodological strengths.
- Identify warnings about search sensitivity.
- Explain your reasoning.

Return ONLY valid JSON using this exact structure:

{
  "pico": {
    "population": [
      {
        "term": "string",
        "vocab": "mesh",
        "reason": "string"
      }
    ],
    "intervention": [],
    "comparison": [],
    "outcome": []
  },
  "qualityCheck": {
    "strengths": [],
    "warnings": []
  },
  "explanation": "string"
}

The vocab field MUST be one of:
"mesh"
"emtree"
"keyword"
`;

        // Gemini API request
        const apiUrl =
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const geminiPayload = {
            contents: [
                {
                    parts: [
                        {
                            text: promptText
                        }
                    ]
                }
            ],
            systemInstruction: {
                parts: [
                    {
                        text: systemPrompt
                    }
                ]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(geminiPayload)
        });

        const result = await response.json();

        // IMPORTANT:
        // Return Google's actual error so we can diagnose it
        if (!response.ok) {
            console.error("Gemini API Error:", result);

            return res.status(response.status).json({
                error: result.error?.message || 'Gemini API request failed',
                details: result
            });
        }

        // Send Gemini response to frontend
        return res.status(200).json(result);

    } catch (error) {
        console.error("Server Error:", error);

        return res.status(500).json({
            error: error.message || 'Failed to communicate with Gemini API'
        });
    }
}
