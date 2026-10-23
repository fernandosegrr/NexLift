

export function setPrivateCache(res) {
    res.set('Cache-Control', 'no-store');
}

