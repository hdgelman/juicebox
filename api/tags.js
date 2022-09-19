const express = require('express');
const { client } = require('../db');
const tagsRouter = express.Router();

tagsRouter.use((req, res, next) => {
    console.log("A request is being made to /tags");

    next();
});

tagsRouter.get('/', async (req, res, next) => {
    try {
        const tags = await client.query(
            `SELECT * FROM tags`
        )

        res.send({
            tags
        });

    } catch (error) {
        next()
    }
});

module.exports = tagsRouter;