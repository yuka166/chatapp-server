import jwt from 'jsonwebtoken';

const isAuth = function (req, res, next) {
    const token = req.cookies.auth;
    if (token) {
        jwt.verify(token, 'asfzpfwo@2914#$%.fs', async function (e, token_data) {
            if (e) {
                res.clearCookie('auth');
                res.clearCookie('logged');
                res.status(403).json(e);
            }
            else {
                res.locals.userID = token_data.id;
                next();
            }
        })
    }
    else {
        res.clearCookie('logged');
        res.status(401).json({ message: 'missing token' });
    }
}

export default isAuth;