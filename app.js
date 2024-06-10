const express = require('express')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

const app = express()
app.use(express.json())

let db = null
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log(`Server Started`)
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const getFollowingPeopleIdsOfTheuser = async username => {
  const getFollowingPeopleQuery = `
        SELECT 
        following_user_id FROM follower
        INNER JOIN user ON user.user_id = follower.follower_user_id
        WHERE user.username = '${username}';`
  const followingPeople = await db.all(getFollowingPeopleQuery)
  const arrayOfIds = followingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}

const authentication = async (request, response, next) => {
  const {tweet} = request.body
  const {tweetId} = request.params

  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.body.username}'`
  const getUserId = await db.get(getUserIdQuery)
  console.log(getUserId)
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        request.tweetId = tweetId
        request.tweet = tweet
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const tweetAccessVerification = async (request, response, next) => {
  const {userId} = request
  console.log(userId)
  const {tweetId} = request.params
  const getTweetQuery = `SELECT 
              *
            FROM
            tweet INNER JOIN follower ON
                tweet.user_id = follower.following_user_id
            WHERE
                tweet.user_id = '${tweetId}' AND follower_user_id = '${userId}';`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API-1 /register/ POST METHOD
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectedUser = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectedUser)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      // console.log(hashedPassword);
      const registerUserQuery = `
                INSERT INTO
                    user(name, username, password, gender)
                VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');`
      const registerUser = await db.run(registerUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API-2 /login/ POST METHOD
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectedUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectedUserQuery)
  // console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)
    // console.log(isPasswordMatch);
    if (isPasswordMatch === true) {
      const payload = {username, userId: dbUser.user_id}
      // console.log(payload);
      const jwtToken = jwt.sign(dbUser, 'MY_SECRET_KEY')
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API-3 GET METHOD /user/tweets/feed/
app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const followingPeopleIds = await getFollowingPeopleIdsOfTheuser(username)

  const getTweetsQuery = `
        SELECT username, tweet, date_time AS dateTime
        FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
        WHERE user.user_id IN (${followingPeopleIds})
        ORDER BY date_time DESC
        LIMIT 4;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API-4 GET METHOD /user/following/
app.get('/user/following/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const getFollowingQuery = `
            SELECT 
                name 
            FROM 
                follower INNER JOIN user ON user.user_id = follower.following_user_id
            WHERE 
                follower.follower_user_id = '${user_id}';`
  const followingPeople = await db.all(getFollowingQuery)
  response.send(followingPeople)
})

//API-5 GET METHOD /user/followers/
app.get('/user/followers/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const getUserId = await db.get(getUserIdQuery)

  const getFollowersQuery = ` 
            SELECT 
                name 
            FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
            WHERE 
                follower.following_user_id = '${user_id}';`
  const getFollowers = await db.all(getFollowersQuery)
  response.send(getFollowers)
})

//API-6 /tweets/:tweetId/ GET METHOD
app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`
  const tweetsResult = await db.get(tweetQuery)

  const userFollowerQuery = `
            SELECT
                *
            FROM
                follower INNER JOIN user ON user.user_id = follower.following_user_id
            WHERE
                follower.follower_user_id = ${user_id}
            ;`
  const userFollowers = await db.all(userFollowerQuery)
  if (
    userFollowers.some(item => item.following_user_id === tweetsResult.user_id)
  ) {
    const getTweetDetailsQuery = `
                        SELECT 
                            tweet,
                            COUNT(DISTINCT(like.like_id)) AS likes,
                            COUNT(DISTINCT(reply.reply_id)) AS replies,
                            tweet.date_time AS dateTime
                        FROM
                            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
                        WHERE
                            tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id}
                            ;`
    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//api-7 /tweets/:tweetId/likes/
app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload

    const getLikesQuery = `
        SELECT 
            *
        FROM 
            follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
            INNER JOIN user ON user.user_id = like.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
            ;`
    const likedUsers = await db.all(getLikesQuery)
    if (likedUsers.length !== 0) {
      let likes = []
      const getNamesArr = likedUsers => {
        for (let item of likedUsers) {
          likes.push(item.username)
        }
      }
      getNamesArr(likedUsers)
      response.send({likes})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-8
app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload

    const getRepliedUsersQuery = `
        SELECT 
            *
        FROM 
            follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            INNER JOIN user ON user.user_id = reply.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
            ;`

    const repliedUsers = await db.all(getRepliedUsersQuery)
    if (repliedUsers.length !== 0) {
      let replies = []
      const getNamesArr = repliedUsers => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
      }
      getNamesArr(repliedUsers)
      response.send({replies})
    } else {
      response.status(401)
      response.send(`Invalid Request`)
    }
  },
)

//API-9
app.get('/user/tweets/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const gettweetsQuery = `
        SELECT 
            tweet.tweet AS tweet, 
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            date_time as dateTime
        FROM 
            user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like on like.tweet_id = tweet.tweet_id INNER JOIN  reply ON reply.tweet_id = tweet.tweet_id
        WHERE 
            user.user_id = ${user_id}
        GROUP BY 
            tweet.tweet_id;`
  const tweets = await db.all(gettweetsQuery)
  response.send(tweets)
})

//API-10 /user/tweets/
app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const postTweetQuery = `INSERT INTO
            tweet(tweet)
            VALUES('${tweet}');`
  const postTweet = await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

//API-11 /tweets/:tweetId/
app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const getTweetQuery = `SELECT * FROM tweet WHERE tweet.user_id = '${user_id}' AND tweet.tweet_id = '${tweetId}';`
  const tweet = await db.all(getTweetQuery)

  if (tweet.length !== 0) {
    const deleteQuery = `DELETE FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = '${tweetId}';`
    const deleteTweet = await db.run(deleteQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
