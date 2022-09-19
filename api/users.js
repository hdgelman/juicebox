const express = require('express');
const usersRouter = express.Router();
const { getAllUsers } = require('../db');

usersRouter.use((req, res, next) => {
    console.log("A request is being made to /users");

    next();
});

usersRouter.get('/', async (req, res, next) => {
    try {
        const users = await getAllUsers();

        res.send({
            users
        });

    } catch (error) {
        next()
    }
});

module.exports = usersRouter;