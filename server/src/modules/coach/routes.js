import { CoachError } from './validation.js';
export function registerRoutes(app, { coach, config, authMiddleware, rateLimit }) {
    if (!config.coachEnabled) return;
    const add = (method, path, handler, max = 60) => {
        app[method](path, authMiddleware, rateLimit({ max, keyFn: req => `coach:${method}:${path}:user:${req.userId}` }), rateLimit({ max: max * 3, keyFn: req => `coach:${method}:${path}:ip:${req.ip}` }), async (req, res) => {
            res.set('Cache-Control', 'private, no-store');
            try {
                if (!await coach.available()) return res.status(503).json({ error: 'Coach se está preparando. Tus entrenamientos siguen disponibles. Vuelve a consultar en unos instantes.' });
                return res.json(await handler(req));
            } catch (error) {
                const expected = error instanceof CoachError || error.code === 'COACH_INPUT' && [404, 409, 422].includes(error.status), conflict = ['P2002', 'P2034'].includes(error.code);
                return res.status(expected ? error.status : conflict ? 409 : 503).json({ error: expected ? error.message : conflict ? 'Conflicto concurrente. Vuelve a consultar antes de confirmar.' : 'Coach no está disponible. No se confirmó ningún guardado.' });
            }
        });
    };
    add('get', '/api/coach/report', r => coach.report(r.userId, r.query.days));
    add('post', '/api/coach/ask', r => coach.ask(r.userId, r.body), 20);
    add('get', '/api/coach/check-ins', r => coach.checkIns(r.userId));
    add('put', '/api/coach/check-ins/:date', r => coach.saveCheckIn(r.userId, r.params.date, r.body));
    add('delete', '/api/coach/check-ins/:date', r => coach.deleteCheckIn(r.userId, r.params.date));
    add('put', '/api/coach/exercises/:id/config', r => coach.config(r.userId, r.params.id, r.body));
    add('get', '/api/coach/exercises/:id/config', r => coach.readConfig(r.userId, r.params.id));
    add('delete', '/api/coach/exercises/:id/config', r => coach.deleteConfig(r.userId, r.params.id));
    add('put', '/api/coach/measurements', r => coach.measure(r.userId, r.body));
    add('delete', '/api/coach/measurements/:id', r => coach.deleteMeasure(r.userId, r.params.id));
    add('get', '/api/coach/suggestions', r => coach.suggestions(r.userId));
    add('post', '/api/coach/exercises/:id/suggestions', r => coach.present(r.userId, r.params.id, r.body), 20);
    add('get', '/api/coach/exercises/:id/results', r => coach.results(r.userId, r.params.id));
    add('post', '/api/coach/exercises/:id/evaluate', r => coach.evaluate(r.userId, r.params.id, r.body));
    add('put', '/api/coach/suggestions/:id/feedback', r => coach.feedback(r.userId, r.params.id, r.body));
}
