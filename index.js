import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';
// import morgan from 'morgan';
import http from 'http';
import { Server } from "socket.io";
import mongoose from 'mongoose';
import database from './config/db/index.js';
import User from './app/models/user.js';
import Chat from './app/models/chat.js';
import Room from './app/models/room.js';
import isAuth from './middlewares/authorization.js';

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const port = process.env.PORT || 4000;
const saltRounds = 10;

database();

// app.use(morgan('combined'))

app.use(cors(
    {
        credentials: true,
        origin: 'http://localhost:5173'
        // origin: 'https://chatapp-yuka166.vercel.app'
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
        credentials: true,
        origin: "http://localhost:5173"
        // origin: 'https://chatapp-yuka166.vercel.app'
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
                        socket.join(token_data.id);
                        socket.token = token_data;
                        next();
                    }
                })
            }
        }
    })

    socket.on('getRooms', async () => {
        const userID = new mongoose.Types.ObjectId(socket.token.id);
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
                .sort({ 'latestChat._id': - 1 })
            rooms.map(item => {
                socket.join(item._id.toString())
            })
            io.in(socket.token.id).emit('allRooms', rooms);
        } catch (e) {
            throw new Error(e)
        }
    })

    socket.on('createRoom', async data => {
        const userID = new mongoose.Types.ObjectId(socket.token.id),
            friendID = new mongoose.Types.ObjectId(data);
        let sendData;
        try {
            const room = await Room.findOne({
                members: {
                    $all: [userID, friendID],
                    $size: 2
                }
            })
            if (room !== null) {
                sendData = room;
            }
            else {
                const friend = await User.findOne({ _id: friendID })
                if (friend !== null) {
                    const newRoom = await Room.create({ members: [userID, friendID] });
                    sendData = newRoom;
                }
            }
            io.in(socket.token.id).in(data).emit('sendRoom', sendData);
            io.in(socket.id).emit('gotoBox', sendData);
        } catch (e) {
            throw new Error(e)
        }
    })

    socket.on('joinRoom', data => {
        socket.join(data)
    })

    socket.on('sendMessage', async (data) => {
        const chatDetails = { ...data, authorID: socket.token.id };
        let username;
        try {
            await Chat.create(chatDetails);
            username = await User.findOne({ _id: new mongoose.Types.ObjectId(socket.token.id) }, { _id: 0, username: 1 })
        } catch (e) {
            throw new Error(e)
        }
        io.in(data.roomID).emit('getMessage', { ...chatDetails, authorName: username })
        io.in(data.roomID).emit('setRoom')
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
        res.json(await User.find({
            username: { $regex: '^' + req.params.username, $options: 'i' },
            _id: { $ne: new mongoose.Types.ObjectId(res.locals.userID) }
        }, { _id: 1, username: 1 }))
    } catch (e) {
        next(e)
    }
})

// [GET] /chats

app.get('/chats/:id', isAuth, async (req, res, next) => {
    try {
        const room = await Room.find({
            _id: new mongoose.Types.ObjectId(req.params.id),
            members: new mongoose.Types.ObjectId(res.locals.userID)
        })
        if (room.length > 0) {
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
            // .sort({ _id: -1 })
            // .limit(20)
            // .sort({ _id: 1 });
            res.json(chat);
        }
        else {
            res.status(401).end();
        }
    } catch (e) {
        next(e)
    }
});

// [GET] /rooms/:id

app.get('/rooms/:id', isAuth, async (req, res, next) => {
    const userID = new mongoose.Types.ObjectId(res.locals.userID);
    try {
        const rooms = await Room.aggregate()
            .match({
                _id: new mongoose.Types.ObjectId(req.params.id),
                members: { $all: [userID] }
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
        res.json(rooms)
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
                        res.cookie('auth', token, { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: "None", secure: true });
                    }
                    else {
                        const token = jwt.sign({ id: user._id }, 'asfzpfwo@2914#$%.fs', { expiresIn: '1d' });
                        res.cookie('auth', token, { httpOnly: true, sameSite: "None", secure: true });
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
    if (/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,4}$/.test(req.body.email)) {
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
    }
    else {
        res.status(401).json({
            status: 'Invalid Email!'
        })
    }
});

//[get] /auth/logout

app.get('/auth/logout', (req, res) => {
    res.clearCookie('auth');
    res.end();
});

server.listen(port, () => {
    console.log(`app listening on port ${port}`)
});