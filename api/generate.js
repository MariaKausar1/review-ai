export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        const { promptText } = req.body;

        if (!promptText) {
            return res.status(400).json({
                error: 'Missing promptText'
            });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: 'OPENROUTER_API_KEY is not configured in Vercel'
            });
        }

        const systemPrompt = `
You are an expert clinical medical librarian and systematic review methodologist.

Analyze the user's research question and extract:

1. Population or Problem
2. Intervention or Exposure
3. Comparison
4. Outcome

For each PICO concept, suggest:
- MeSH terms
- Emtree terms
- Free-text keywords
- Synonyms
- Spelling variants
- Acronyms
- Generic drug names
- Brand drug names

IMPORTANT:

All controlled vocabulary suggestions must be labelled:
"AI-Suggested"

Do not claim that any MeSH or Emtree term has been officially verified.

SEARCH STRATEGY:

Create TWO separate search strategies.

STRATEGY 1: recommendedSensitiveStrategy

This is the PRIMARY recommended systematic review strategy.

It MUST contain:

Population AND Intervention

It should prioritize sensitivity and recall.

It MUST NOT include:
- Adult
- Adults
- Aged
- Age terms
- Placebo
- Sham
- Control
- Comparison terms
- Outcome terms
- Seizure frequency
- Quality of life

The recommended strategy MUST contain the main Population or Problem concept from the research question.

The recommended strategy MUST contain the main Intervention or Exposure concept from the research question.

NEVER generate a recommended strategy using only:
Adult AND Intervention AND Comparison

NEVER omit the Population or Problem concept.

For example, for:

"In adults with drug-resistant epilepsy, does cannabidiol compared with placebo reduce seizure frequency and improve quality of life?"

The recommended sensitive strategy must conceptually be:

(Epilepsy population terms)
AND
(Cannabidiol intervention terms)

It must NOT contain:
Adult
Placebo
Sham
Control
Seizure frequency
Quality of life

STRATEGY 2: optionalFocusedStrategy

This may include:
- Comparison terms
- Placebo
- Sham
- Outcome terms
- Other restrictive concepts

However, it MUST still contain:

Population AND Intervention

Clearly warn that the optional focused strategy may reduce sensitivity and may miss relevant studies.

DATABASE SYNTAX:

Generate syntax for:
- PubMed
- Embase
- Cochrane Library
- Scopus
- Web of Science
- CINAHL

For PubMed:
Use [Mesh] for AI-suggested MeSH terms.
Use [tiab] for free-text terms.

For Embase:
Use /exp for AI-suggested Emtree terms.
Use :ti,ab for free-text terms.
Always format Emtree terms exactly as 'Term'/exp.
Do NOT write 'exp Term'/exp.
Do NOT add extra quotes or the word exp before the term.

For Scopus:
Use TITLE-ABS-KEY().

For Web of Science:
Use TS=().

For CINAHL:
Use MH "Term+" for AI-suggested subject headings.
Use TI "Term" OR AB "Term" for free-text keywords.
Always include all selected Population and Intervention keywords.
Combine synonyms within each concept using OR.
Combine Population and Intervention concepts using AND.

For Cochrane:
Use [mh] and :ti,ab,kw.

3IMPORTANT FINAL CHECK:

Before returning the JSON, check the recommendedSensitiveStrategy.

It MUST:
1. Contain Population/Problem concepts.
2. Contain Intervention/Exposure concepts.
3. NOT contain placebo.
4. NOT contain sham.
5. NOT contain control.
6. NOT contain adult, adults, or aged.
7. NOT contain outcome terms.
8. NOT contain seizure frequency.
9. NOT contain quality of life.

If any of these rules are violated, correct the recommendedSensitiveStrategy before returning the answer.

The optionalFocusedStrategy may contain comparison or outcome terms but MUST still contain Population AND Intervention.

Perform a sensitivity audit identifying:
- Unnecessary outcome restrictions
- Unnecessary comparator restrictions
- Unnecessary age restrictions
- Missing synonyms
- Missing spelling variants
- Missing generic or brand drug names

Return ONLY valid JSON.

Use exactly this structure:

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

For every PICO term use:

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

Return only JSON.
`;

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
                    temperature: 0.1
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            console.error('OpenRouter API Error:', result);

            return res.status(response.status).json({
                error:
                    result.error?.message ||
                    'OpenRouter API request failed',
                details: result
            });
        }

        const aiText =
            result.choices?.[0]?.message?.content;

        if (!aiText) {
            return res.status(500).json({
                error: 'OpenRouter returned an empty response',
                details: result
            });
        }

        const cleanedText = aiText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

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

        /*
         * SAFETY CHECK:
         * Make sure the recommended sensitive strategy
         * does not contain obvious restrictive concepts.
         */

        const sensitiveFields = [
            'pubmed',
            'embase',
            'cochrane',
            'scopus',
            'webOfScience',
            'cinahl'
        ];

        const forbiddenTerms = [
            'placebo',
            'placebos',
            'sham',
            'control',
            'adult',
            'adults',
            'aged',
            'seizure frequency',
            'quality of life'
        ];

        if (parsedData.recommendedSensitiveStrategy) {
            for (const field of sensitiveFields) {
                const strategy =
                    parsedData.recommendedSensitiveStrategy[field];

                if (typeof strategy === 'string') {
                    const lowerStrategy =
                        strategy.toLowerCase();

                    const foundForbiddenTerm =
                        forbiddenTerms.find(term =>
                            lowerStrategy.includes(term)
                        );

                    if (foundForbiddenTerm) {
                        console.warn(
                            `Warning: Recommended strategy contains forbidden term "${foundForbiddenTerm}" in ${field}`
                        );
                    }
                }
            }
        }

        /*
         * Return data in the format expected by the existing frontend.
         */

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
