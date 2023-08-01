import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import http from 'http';
import { Server } from "socket.io";
import mongoose from 'mongoose';
import database from './config/db/index.js';
import User from './app/models/user.js';
import Chat from './app/models/chat.js';
import Room from './app/models/room.js';
import isAuth from './middlewares/authorization.js';
import { isatty } from 'tty';

const app = express();
const server = http.createServer(app);
const port = 4000;
const saltRounds = 10;

database();

app.use(morgan('combined'))

app.use(cors(
    {
        credentials: true,
        origin: 'http://localhost:5173'
    }
));

app.use(
    express.urlencoded({
        extended: true,
    }),
);
app.use(express.json());

app.use(cookieParser());

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        credentials: true
    }
});

io.on("connection", (socket) => {

    socket.use((packet, next) => {
        if (socket.request.headers.cookie) {
            const token = cookie.parse(socket.request.headers.cookie).auth;
            if (token) {
                jwt.verify(token, 'asfzpfwo@2914#$%.fs', async function (e, token_data) {
                    if (e) {
                        next(e)
                    }
                    else {
                        io.to(socket.id).emit("getId", token_data.id);
                        socket.token = token_data;
                        next();
                    }
                })
            }
        }
    })

    console.log("New client connected: " + socket.id);

    socket.on('joinRooms', data => {
        data.map(item => {
            socket.join(item._id)
        })
    })

    socket.on('sendMessage', async (data, next) => {
        const chatDetails = { ...data, authorID: socket.token.id };
        let username;
        try {
            await Chat.create(chatDetails);
            username = await User.findOne({ _id: new mongoose.Types.ObjectId(socket.token.id) }, { _id: 0, username: 1 })
        } catch (e) {
            next(e);
        }
        io.in(data.roomID).emit('getMessage', { ...chatDetails, authorName: username })
    })

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

app.get('/', (req, res) => {
    res.send('Hello World!')
});

// [GET] /users/:username

app.get('/users/:username', isAuth, async (req, res, next) => {
    try {
        res.json(await User.find({ username: { $regex: '^' + req.params.username, $options: 'i' } }, { _id: 1, username: 1 }))
    } catch (e) {
        next(e)
    }
})

// [GET] /room-exist

app.get('/room-exist', isAuth, async (req, res, next) => {
    const userID = new mongoose.Types.ObjectId(res.locals.userID);
    try {
        const rooms = await Room.findOne({
            members: {
                $all: [new mongoose.Types.ObjectId('64bce08b61715f4732a88a07'),
                new mongoose.Types.ObjectId('64bc215deb5bf26b436016ca')],
                $size: 2
            }
        })
        res.json(rooms);
    } catch (e) {
        next(e)
    }
});

// [GET] /rooms

app.get('/rooms', isAuth, async (req, res, next) => {
    const userID = new mongoose.Types.ObjectId(res.locals.userID);
    try {
        const rooms = await Room.aggregate()
            .match({
                members: userID
            })
            .lookup({
                from: 'chats',
                localField: '_id',
                foreignField: 'roomID',
                as: 'latestChat',
                pipeline: [
                    {
                        "$sort": { _id: -1 }
                    },
                    {
                        "$project": {
                            _id: 1, content: 1
                        }
                    },
                    {
                        "$limit": 1
                    }
                ]
            })
            .lookup({
                from: 'users',
                localField: 'members',
                foreignField: '_id',
                as: 'members',
                pipeline: [
                    {
                        "$project": {
                            _id: 1, username: 1
                        }
                    },
                    {
                        "$match": { _id: { "$ne": userID } }
                    }
                ]
            })
        res.json(rooms);
    } catch (e) {
        next(e)
    }
});

// [GET] /chats

app.get('/chats/:id', isAuth, async (req, res, next) => {
    try {
        const test = await Room.find({
            _id: new mongoose.Types.ObjectId(req.params.id),
            members: new mongoose.Types.ObjectId(res.locals.userID)
        })
        if (test.length > 0) {
            const chat = await Chat.aggregate()
                .match({
                    roomID: new mongoose.Types.ObjectId(req.params.id)
                })
                .lookup({
                    from: 'users',
                    localField: 'authorID',
                    foreignField: '_id',
                    as: 'authorName',
                    pipeline: [
                        {
                            "$project": {
                                username: 1, _id: 0
                            }
                        }
                    ]
                })
                .unwind('$authorName')
                .addFields({
                    sender: {
                        $cond: {
                            if: {
                                $eq: ["$authorID", new mongoose.Types.ObjectId(res.locals.userID)]
                            },
                            then: 'true',
                            else: 'false'
                        }
                    }
                })
                .sort({ _id: -1 })
                .limit(20)
                .sort({ _id: 1 });
            res.json(chat);
        }
        else {
            res.status(401).end();
        }
    } catch (e) {
        next(e)
    }
});

// [POST] /auth/login

app.post('/auth/login', async (req, res, next) => {
    const formData = req.body;
    try {
        const user = await User.findOne({ username: formData.username })
        if (user !== null) {
            bcrypt.compare(formData.password, user.password, function (err, result) {
                if (err) {
                    res.status(401).json({ error: err });
                }
                if (result) {
                    if (formData.staySignIn) {
                        const token = jwt.sign({ id: user._id }, 'asfzpfwo@2914#$%.fs', { expiresIn: '7d' });
                        res.cookie('auth', token, { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true });
                        res.cookie('logged', true, { maxAge: 1000 * 60 * 60 * 24 * 7 });
                    }
                    else {
                        const token = jwt.sign({ id: user._id }, 'asfzpfwo@2914#$%.fs', { expiresIn: '1d' });
                        res.cookie('auth', token, { httpOnly: true });
                        res.cookie('logged', true);
                    }
                    res.status(200).end();
                }
                else {
                    res.status(401).json({ status: 'Login Failed!' });
                }
            });
        }
        else (
            res.status(401).end()
        )
    } catch (e) {
        next(e)
    }
});

// [POST] /auth/register

app.post('/auth/register', (req, res, next) => {
    const formData = req.body;
    bcrypt.hash(formData.password, saltRounds, async (err, hash) => {
        if (err) {
            res.json({
                status: 'Hashing Error!'
            });
        }
        formData.password = hash;
        const user = new User(formData);
        try {
            await user.save();
            res.status(200).json({
                status: 'Create Succesfully!'
            });
        } catch (e) {
            res.status(401).json({
                status: 'Create Failed!',
                error: e
            });
            next(e);
        }
    });
});

//[get] /auth/logout

app.get('/auth/logout', (req, res) => {
    res.clearCookie('auth');
    res.clearCookie('logged');
    res.end();
});

server.listen(port, () => {
    console.log(`app listening on port ${port}`)
});