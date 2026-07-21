export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        const { term } = req.body;

        if (!term) {
            return res.status(400).json({
                error: 'Missing term'
            });
        }

        const url =
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
            `?db=mesh` +
            `&term=${encodeURIComponent(term)}[MeSH Terms]` +
            `&retmode=json`;

        const response = await fetch(url);

        if (!response.ok) {
            return res.status(500).json({
                error: 'NLM API request failed'
            });
        }

        const data = await response.json();

        const count = Number(
            data.esearchresult?.count || 0
        );

        return res.status(200).json({
            term,
            verified: count > 0,
            count
        });

    } catch (error) {
        console.error('MeSH verification error:', error);

        return res.status(500).json({
            error: error.message ||
                'Failed to verify MeSH term'
        });
    }
}
