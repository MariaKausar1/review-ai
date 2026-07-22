export default async function handler(req, res) {
    // ==========================================
    // 1. ONLY ALLOW POST REQUESTS
    // ==========================================

    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        // ==========================================
        // 2. GET USER QUESTION
        // ==========================================

        const { promptText } = req.body || {};

        if (!promptText || typeof promptText !== 'string') {
            return res.status(400).json({
                error: 'Missing promptText'
            });
        }

        // ==========================================
        // 3. GET OPENROUTER API KEY
        // ==========================================

        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            console.error(
                'OPENROUTER_API_KEY is not configured'
            );

            return res.status(500).json({
                error:
                    'OPENROUTER_API_KEY is not configured in Vercel'
            });
        }

        // ==========================================
        // 4. SYSTEM PROMPT
        // ==========================================

        const systemPrompt = `
You are an expert clinical medical librarian and systematic review methodologist.

Your task is to analyze the user's research question and create a structured PICO analysis and database search strategies.

Extract:

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

------------------------------------------
SEARCH STRATEGY 1
------------------------------------------

Create:

recommendedSensitiveStrategy

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

The recommended strategy MUST contain the main Population or Problem concept.

The recommended strategy MUST contain the main Intervention or Exposure concept.

NEVER generate a recommended strategy using only:

Adult AND Intervention AND Comparison

NEVER omit the Population or Problem concept.

For example:

Research question:

"In adults with drug-resistant epilepsy, does cannabidiol compared with placebo reduce seizure frequency and improve quality of life?"

The recommended sensitive strategy should conceptually be:

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

------------------------------------------
SEARCH STRATEGY 2
------------------------------------------

Create:

optionalFocusedStrategy

This strategy MAY include:

- Comparison terms
- Placebo
- Sham
- Outcome terms
- Other restrictive concepts

However, it MUST still contain:

Population AND Intervention

Clearly warn that the optional focused strategy may reduce sensitivity and may miss relevant studies.

------------------------------------------
DATABASE SYNTAX
------------------------------------------

Generate syntax for:

- PubMed
- Embase
- Cochrane Library
- Scopus
- Web of Science
- CINAHL

PUBMED:

Use [Mesh] for AI-suggested MeSH terms.

Use [tiab] for free-text terms.

EMBASE:

Use /exp for AI-suggested Emtree terms.

Use :ti,ab for free-text terms.

Always format Emtree terms exactly as:

'Term'/exp

Do NOT write:

'exp Term'/exp

Do NOT add extra quotes or the word exp before the term.

SCOPUS:

Use:

TITLE-ABS-KEY()

WEB OF SCIENCE:

Use:

TS=()

CINAHL:

Use:

MH "Term+"

for AI-suggested subject headings.

Use:

TI "Term" OR AB "Term"

for free-text keywords.

Always include all selected Population and Intervention keywords.

Combine synonyms within each concept using OR.

Combine Population and Intervention concepts using AND.

COCHRANE:

Use:

[mh]

and:

:ti,ab,kw

------------------------------------------
FINAL QUALITY CHECK
------------------------------------------

Before returning the JSON, check recommendedSensitiveStrategy.

It MUST:

1. Contain Population/Problem concepts.
2. Contain Intervention/Exposure concepts.
3. NOT contain placebo.
4. NOT contain sham.
5. NOT contain control.
6. NOT contain adult.
7. NOT contain adults.
8. NOT contain aged.
9. NOT contain outcome terms.
10. NOT contain seizure frequency.
11. NOT contain quality of life.

If any of these rules are violated, correct the recommendedSensitiveStrategy.

The optionalFocusedStrategy may contain comparison or outcome terms but MUST still contain Population AND Intervention.

Perform a sensitivity audit identifying:

- Unnecessary outcome restrictions
- Unnecessary comparator restrictions
- Unnecessary age restrictions
- Missing synonyms
- Missing spelling variants
- Missing generic drug names
- Missing brand drug names

------------------------------------------
IMPORTANT OUTPUT RULE
------------------------------------------

Return ONLY valid JSON.

Do NOT use Markdown.

Do NOT use code fences.

Do NOT write any text before the JSON.

Do NOT write any text after the JSON.

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

Return ONLY valid JSON.
`;

        // ==========================================
        // 5. CALL OPENROUTER
        // ==========================================

        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer':
                        'https://review-ai-ncxw.vercel.app',
                    'X-OpenRouter-Title':
                        'ReviewAI'
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

        // ==========================================
        // 6. READ OPENROUTER RESPONSE
        // ==========================================

        const result = await response.json();

        // ==========================================
        // 7. HANDLE OPENROUTER API ERRORS
        // ==========================================

        if (!response.ok) {
            console.error(
                'OpenRouter API Error:',
                JSON.stringify(result, null, 2)
            );

            return res.status(500).json({
                error:
                    result?.error?.message ||
                    'OpenRouter API request failed',

                details: result
            });
        }

        // ==========================================
        // 8. GET AI TEXT
        // ==========================================

        const choice =
            result?.choices?.[0];

        const message =
            choice?.message;

        let aiText =
            message?.content;

        // ==========================================
        // 9. HANDLE DIFFERENT OPENROUTER RESPONSES
        // ==========================================

        // Some providers may return content as an array
        if (Array.isArray(aiText)) {
            aiText = aiText
                .map(item => {
                    if (typeof item === 'string') {
                        return item;
                    }

                    return item?.text || '';
                })
                .join('');
        }

        // Convert to string if necessary
        if (
            aiText !== null &&
            aiText !== undefined &&
            typeof aiText !== 'string'
        ) {
            aiText = JSON.stringify(aiText);
        }

        // ==========================================
        // 10. CHECK EMPTY RESPONSE
        // ==========================================

        if (!aiText || !aiText.trim()) {
            console.error(
                'OpenRouter returned empty content'
            );

            console.error(
                'Full OpenRouter response:',
                JSON.stringify(result, null, 2)
            );

            return res.status(500).json({
                error:
                    'OpenRouter returned an empty response',

                details: {
                    choices:
                        result?.choices || null,

                    finishReason:
                        choice?.finish_reason || null,

                    provider:
                        result?.provider || null,

                    model:
                        result?.model || null
                }
            });
        }

        console.log(
            'AI response received successfully'
        );

        // ==========================================
        // 11. CLEAN AI RESPONSE
        // ==========================================

        let cleanedText =
            aiText.trim();

        // Remove ```json
        cleanedText =
            cleanedText.replace(
                /^```json\s*/i,
                ''
            );

        // Remove ```
        cleanedText =
            cleanedText.replace(
                /^```\s*/i,
                ''
            );

        cleanedText =
            cleanedText.replace(
                /\s*```$/i,
                ''
            );

        cleanedText =
            cleanedText.trim();

        // ==========================================
        // 12. FIND JSON OBJECT
        // ==========================================

        const firstBrace =
            cleanedText.indexOf('{');

        const lastBrace =
            cleanedText.lastIndexOf('}');

        if (
            firstBrace === -1 ||
            lastBrace === -1 ||
            lastBrace <= firstBrace
        ) {
            console.error(
                'No JSON object found'
            );

            console.error(
                'AI response:',
                aiText
            );

            return res.status(500).json({
                error:
                    'AI response did not contain valid JSON',

                rawResponse:
                    aiText
            });
        }

        cleanedText =
            cleanedText.substring(
                firstBrace,
                lastBrace + 1
            );

        // ==========================================
        // 13. PARSE JSON
        // ==========================================

        let parsedData;

        try {
            parsedData =
                JSON.parse(
                    cleanedText
                );
        } catch (parseError) {
            console.error(
                'JSON Parse Error:',
                parseError.message
            );

            console.error(
                'AI Raw Response:',
                aiText
            );

            console.error(
                'Cleaned Response:',
                cleanedText
            );

            return res.status(500).json({
                error:
                    'AI returned invalid JSON',

                details:
                    parseError.message,

                rawResponse:
                    aiText
            });
        }

        // ==========================================
        // 14. BASIC VALIDATION
        // ==========================================

        if (
            !parsedData ||
            typeof parsedData !== 'object'
        ) {
            return res.status(500).json({
                error:
                    'Invalid AI response structure'
            });
        }

        // Make sure required sections exist
        if (!parsedData.pico) {
            parsedData.pico = {
                population: [],
                intervention: [],
                comparison: [],
                outcome: []
            };
        }

        if (!parsedData.qualityCheck) {
            parsedData.qualityCheck = {
                strengths: [],
                warnings: []
            };
        }

        if (
            !parsedData.recommendedSensitiveStrategy
        ) {
            parsedData.recommendedSensitiveStrategy = {
                logic:
                    'Population AND Intervention',
                pubmed: '',
                embase: '',
                cochrane: '',
                scopus: '',
                webOfScience: '',
                cinahl: ''
            };
        }

        if (
            !parsedData.optionalFocusedStrategy
        ) {
            parsedData.optionalFocusedStrategy = {
                logic:
                    'Population AND Intervention AND optional Comparison and/or Outcome',
                pubmed: '',
                embase: '',
                cochrane: '',
                scopus: '',
                webOfScience: '',
                cinahl: ''
            };
        }

        if (
            typeof parsedData.explanation !==
            'string'
        ) {
            parsedData.explanation = '';
        }

        // ==========================================
        // 15. CHECK SENSITIVE STRATEGY
        // ==========================================

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

        for (
            const field
            of sensitiveFields
        ) {
            const strategy =
                parsedData
                    .recommendedSensitiveStrategy[
                        field
                    ];

            if (
                typeof strategy ===
                'string'
            ) {
                const lowerStrategy =
                    strategy.toLowerCase();

                const foundForbiddenTerm =
                    forbiddenTerms.find(
                        term =>
                            lowerStrategy.includes(
                                term
                            )
                    );

                if (
                    foundForbiddenTerm
                ) {
                    console.warn(
                        `Sensitive strategy warning: "${foundForbiddenTerm}" found in ${field}`
                    );
                }
            }
        }

        // ==========================================
        // 16. RETURN DATA TO FRONTEND
        // ==========================================

        return res.status(200).json({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text:
                                    JSON.stringify(
                                        parsedData
                                    )
                            }
                        ]
                    }
                }
            ]
        });

    } catch (error) {

        // ==========================================
        // 17. GENERAL SERVER ERROR
        // ==========================================

        console.error(
            'Server Error:',
            error
        );

        return res.status(500).json({
            error:
                error?.message ||
                'Failed to communicate with OpenRouter'
        });
    }
}
