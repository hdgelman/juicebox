const { Client } = require('pg') // imports pg module

//supply db name and location
const client = new Client('postgres://localhost:5432/juicebox-dev');

//CREATE USER
const createUser = async ({
    username,
    password,
    name,
    location
}) => {
    try {
        const { rows: [user] } = await client.query(`
      INSERT INTO users(username, password, name, location) 
      VALUES($1, $2, $3, $4) 
      ON CONFLICT (username) DO NOTHING 
      RETURNING *;
    `, [username, password, name, location]);
        return user;
    } catch (error) {
        throw error;
    }
}

//UPDATE USER
const updateUser = async (id, fields = {}) => {
    const setString = Object.keys(fields).map(
        (key, index) => `"${key}"=$${index + 1}`
    ).join(', ');
    // return early if this is called without fields
    if (setString.length === 0) {
        return;
    }
    try {
        const { rows: [user] } = await client.query(`
      UPDATE users
      SET ${setString}
      WHERE id=${id}
      RETURNING *;
    `, Object.values(fields));

        return user;
    } catch (error) {
        throw error;
    }
}

//GET USERS
const getAllUsers = async () => {
    try {
        const { rows } = await client.query(`
      SELECT id, username, name, location, active 
      FROM users;
    `);

        return rows;
    } catch (error) {
        throw error;
    }
}

//GET USER BY ID
const getUserById = async (userId) => {
    try {
        const { rows: [user] } = await client.query(`
      SELECT id, username, name, location, active
      FROM users
      WHERE id=${userId}
    `);
        if (!user) {
            return null;
        }

        user.posts = await getPostsByUser(userId);
        return user;
    } catch (error) {
        throw error;
    }
}

//POSTS
const createPost = async ({
    authorId,
    title,
    content,
    tags = [] // this is new
}) => {
    try {
        const { rows: [post] } = await client.query(`
        INSERT INTO posts("authorId", title, content) 
        VALUES($1, $2, $3)
        RETURNING *;
      `, [authorId, title, content]);

        const tagList = await createTags(tags);

        return await addTagsToPost(post.id, tagList);
    } catch (error) {
        throw error;
    }
}

const updatePost = async (postId, fields = {}) => {
    // read off the tags & remove that field 
    const { tags } = fields; // might be undefined
    delete fields.tags;

    // build the set string
    const setString = Object.keys(fields).map(
        (key, index) => `"${key}"=$${index + 1}`
    ).join(', ');

    try {
        // update any fields that need to be updated
        if (setString.length > 0) {
            await client.query(`
          UPDATE posts
          SET ${setString}
          WHERE id=${postId}
          RETURNING *;
        `, Object.values(fields));
        }

        // return early if there's no tags to update
        if (tags === undefined) {
            return await getPostById(postId);
        }

        // make any new tags that need to be made
        const tagList = await createTags(tags);
        const tagListIdString = tagList.map(
            tag => `${tag.id}`
        ).join(', ');

        // delete any post_tags from the database which aren't in that tagList
        await client.query(`
        DELETE FROM post_tags
        WHERE "tagId"
        NOT IN (${tagListIdString})
        AND "postId"=$1;
      `, [postId]);

        // and create post_tags as necessary
        await addTagsToPost(postId, tagList);

        return await getPostById(postId);
    } catch (error) {
        throw error;
    }
}

//POSTS
const getAllPosts = async () => {
    try {
        const { rows: postIds } = await client.query(`
          SELECT id
          FROM posts;
        `);

        const posts = await Promise.all(postIds.map(
            post => getPostById(post.id)
        ));

        return posts;
    } catch (error) {
        throw error;
    }
}

const getPostsByUser = async (userId) => {
    try {
        const { rows: postIds } = await client.query(`
          SELECT id 
          FROM posts 
          WHERE "authorId"=${userId};
        `);

        const posts = await Promise.all(postIds.map(
            post => getPostById(post.id)
        ));

        return posts;
    } catch (error) {
        throw error;
    }
}

//CREATE TAGS
const createTags = async (tagList) => {
    if (tagList.length === 0) {
        return;
    }
    // need something like: $1), ($2), ($3 
    const insertValues = tagList.map((_, index) => `$${index + 1}`).join('), (');
    // ['#blah', '#blahaha', '#ble']
    // ['$1', '$2', '$3']
    // '$1), ($2), ($3'

    const selectValues = tagList.map((_, index) => `$${index + 1}`).join(', ');

    try {
        await client.query(`
        INSERT INTO tags(name)
        VALUES (${insertValues})
        ON CONFLICT (name) DO NOTHING;
        `, tagList);

        const { rows } = await client.query(`
        SELECT * FROM tags
        WHERE name IN (${selectValues});
        `, tagList);

        return rows;
    } catch (error) {
        throw error;
    }
}

//POST TAG
const createPostTag = async (postId, tagId) => {
    try {
        await client.query(`
        INSERT INTO post_tags("postId", "tagId")
        VALUES ($1, $2)
        ON CONFLICT ("postId", "tagId") DO NOTHING;
      `, [postId, tagId]);
    } catch (error) {
        throw error;
    }
}

const addTagsToPost = async (postId, tagList) => {
    try {
        const createPostTagPromises = tagList.map(
            tag => createPostTag(postId, tag.id)
        );

        await Promise.all(createPostTagPromises);

        return await getPostById(postId);
    } catch (error) {
        throw error;
    }
}

async function getPostsByTagName(tagName) {
    try {
        const { rows: postIds } = await client.query(`
        SELECT posts.id
        FROM posts
        JOIN post_tags ON posts.id=post_tags."postId"
        JOIN tags ON tags.id=post_tags."tagId"
        WHERE tags.name=$1;
      `, [tagName]);

        return await Promise.all(postIds.map(
            post => getPostById(post.id)
        ));
    } catch (error) {
        throw error;
    }
}

const getPostById = async (postId) => {
    try {
        const { rows: [post] } = await client.query(`
        SELECT *
        FROM posts
        WHERE id=$1;
      `, [postId]);

        const { rows: tags } = await client.query(`
        SELECT tags.*
        FROM tags
        JOIN post_tags ON tags.id=post_tags."tagId"
        WHERE post_tags."postId"=$1;
      `, [postId])

        const { rows: [author] } = await client.query(`
        SELECT id, username, name, location
        FROM users
        WHERE id=$1;
      `, [post.authorId])
        post.tags = tags;
        post.author = author;
        delete post.authorId;

        return post;
    } catch (error) {
        throw error;
    }
}
async function getUserByUsername(username) {
    try {
        const { rows: [user] } = await client.query(`
        SELECT *
        FROM users
        WHERE username=$1;
      `, [username]);

        return user;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    client,
    createUser,
    updateUser,
    getAllUsers,
    getUserById,
    createPost,
    updatePost,
    getAllPosts,
    getPostsByTagName,
    getUserByUsername
}