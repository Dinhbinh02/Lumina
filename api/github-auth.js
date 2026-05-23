
export default async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Missing code parameter' });
    }

    const client_id = process.env.GITHUB_CLIENT_ID;
    const client_secret = process.env.GITHUB_CLIENT_SECRET;

    if (!client_id || !client_secret) {
        return res.status(500).json({ error: 'GitHub OAuth not configured on server (missing Env Vars)' });
    }

    try {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ client_id, client_secret, code }),
        });

        const data = await response.json();
        
        
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to exchange token: ' + error.message });
    }
}
