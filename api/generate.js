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

        // Get OpenRouter API key from Vercel
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: 'OPENROUTER_API_KEY is not configured in Vercel'
            });
        }

        // System instructions
        const systemPrompt = `
You are an expert clinical medical librarian and systematic review methodologist.

Analyze the user's research question and extract PICO elements.

For EACH concept, suggest:
1. MeSH terms for PubMed.
2. Emtree terms for Embase.
3. Free-text keywords.

Keywords should include, where relevant:
- Spelling variants
- Acronyms
- Generic drug names
- Brand drug names
- Common synonyms
- Truncation suggestions using *

Give a short rationale for every suggested term.

Also perform a quality audit:
- Identify strengths in the search concept.
- Identify important warnings.
- Warn if outcome terms may unnecessarily restrict search sensitivity.
- Explain important methodological considerations.

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

The vocab field MUST be exactly one of:
"mesh"
"emtree"
"keyword"
`;

        // OpenRouter API
        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://review-ai-ncxw.vercel.app',
                    'X-OpenRouter-Title': 'ReviewAI'
                },
                body: JSON.stringify({
                    model: 'openrouter/free',
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: promptText
                        }
                    ],
                    temperature: 0.2
                })
            }
        );

        const result = await response.json();

        // Show actual OpenRouter error
        if (!response.ok) {
            console.error('OpenRouter API Error:', result);

            return res.status(response.status).json({
                error:
                    result.error?.message ||
                    'OpenRouter API request failed',
                details: result
            });
        }

        // Extract AI response
        const aiText =
            result.choices?.[0]?.message?.content;

        if (!aiText) {
            return res.status(500).json({
                error: 'OpenRouter returned an empty response',
                details: result
            });
        }

        // Remove possible markdown JSON fences
        const cleanedText = aiText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // Validate JSON
        let parsedData;

        try {
            parsedData = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('AI Response:', aiText);

            return res.status(500).json({
                error: 'AI returned invalid JSON',
                rawResponse: aiText
            });
        }

        // Return data in the format expected by your frontend
        return res.status(200).json({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: JSON.stringify(parsedData)
                            }
                        ]
                    }
                }
            ]
        });

    } catch (error) {
        console.error('Server Error:', error);

        return res.status(500).json({
            error:
                error.message ||
                'Failed to communicate with OpenRouter'
        });
    }
}
