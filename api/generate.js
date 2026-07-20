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

Analyze the user's research question.

First identify:
1. Population or Problem
2. Intervention or Exposure
3. Comparison
4. Outcome

For each concept, suggest:
- MeSH terms
- Emtree terms
- Free-text keywords
- Synonyms
- Spelling variants
- Acronyms
- Generic drug names
- Brand drug names

IMPORTANT SEARCH RULE:

The recommended sensitive systematic review search should normally use:

Population AND Intervention

Do NOT automatically include:
- Outcome terms
- Comparison terms such as placebo
- Age terms such as Adult

These terms can reduce search sensitivity and cause relevant studies to be missed.

For the recommended sensitive search strategy:
- Use Population AND Intervention.
- Do not include Adult as an OR term with the disease.
- Do not automatically include Placebo or Sham.
- Do not automatically include outcomes such as seizure frequency or quality of life.

Also create an optional focused strategy that may include Comparison and/or Outcome terms.

Clearly warn the user that the focused strategy may retrieve fewer studies.

Perform a sensitivity audit and identify:
- Unnecessary outcome restrictions
- Unnecessary comparator restrictions
- Unnecessary age restrictions
- Missing synonyms
- Missing spelling variants
- Missing generic or brand drug names

IMPORTANT:

Do not claim that a MeSH or Emtree term has been officially verified.
All vocabulary suggestions should be labelled "AI-Suggested".

Return ONLY valid JSON.

Use this exact structure:

{
  "pico": {
    "population": [],
    "intervention": [],
    "comparison": [],
    "outcome": []
  },
  "qualityCheck": {
    "strengths": [],
    "warnings": []
  },
  "recommendedSensitiveStrategy": {
    "logic": "Population AND Intervention",
    "pubmed": "",
    "embase": "",
    "cochrane": "",
    "scopus": "",
    "webOfScience": "",
    "cinahl": ""
  },
  "optionalFocusedStrategy": {
    "logic": "Population AND Intervention AND optional Comparison and/or Outcome",
    "pubmed": "",
    "embase": "",
    "cochrane": "",
    "scopus": "",
    "webOfScience": "",
    "cinahl": ""
  },
  "explanation": ""
}

For each PICO term use:

{
  "term": "string",
  "vocab": "mesh",
  "status": "AI-Suggested",
  "reason": "string"
}

The vocab field must be exactly one of:
"mesh"
"emtree"
"keyword"

Do not invent official controlled vocabulary terms.

For PubMed use:
[Mesh] for MeSH suggestions
[tiab] for keywords

For Embase use:
/exp for Emtree suggestions
:ti,ab for keywords

For Scopus use:
TITLE-ABS-KEY()

For Web of Science use:
TS=()

For CINAHL use:
MH for subject headings
TI and AB for keywords

For Cochrane use:
[mh] and :ti,ab,kw

Make the recommended sensitive strategy prioritize recall and sensitivity.

Return only JSON.
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
