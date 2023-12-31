//jshint esversion:6
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(
  session({
    secret: "Our little secret.",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(
  `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.g7aqmwy.mongodb.net/authentication_data`,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  secrets: [String] //previously we use string and change it to the array so users secrets are not seen by other users.
});


userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id)
    .then(function (user) {
      done(null, user);
    })
    .catch(function (err) {
      done(err, null);
    });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL:
        "https://mysecrets-k8z7.onrender.com/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (accessToken, refreshToken, profile, cb) {
      console.log(profile);
      User.findOrCreate(
        { googleId: profile.id, username: `googleUser_${profile.id}` },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

app.get("/", function (req, res) {
  res.render("home");
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/secrets",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect("/secrets");
  }
);

app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/register", function (req, res) {
  res.render("register");
});

app.get("/secrets", function (req, res) {
  // Check if the user is authenticated
  if (req.isAuthenticated()) {
    // Use the User model to find the currently logged-in user and their secrets
    User.findById(req.user.id)
      .then(function (foundUser) {
        if (foundUser && foundUser.secrets.length>0) {
          // Render the "secrets" view with the secrets of the currently logged-in user
          console.log("user is " , foundUser);
          console.log("Secret is " , foundUser.secrets);
          res.render("secrets", { usersWithSecrets: [foundUser] });
        }
        else{
          res.render("secrets", { SecretMessage: "No Secrets Yet! Submit A Secret" });
        }
      })
      .catch(function (err) {
        // Handle errors by logging them to the console
        console.log(err);
        res.redirect("/login"); // Redirect to login page in case of an error
      });
  } else {
    // Redirect to the login page if the user is not authenticated
    res.redirect("/login");
  }
});


app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

app.post("/submit", function (req, res) {
  const submittedSecret = req.body.secret;

  // Once the user is authenticated and their session gets saved, their user details are saved to req.user.
  // console.log(req.user.id);

  User.findById(req.user.id)
    .then(function (foundUser) {
      if (foundUser) {
        foundUser.secrets.push(submittedSecret);
        return foundUser.save();
      }
    })
    .then(function () {
      res.redirect("/secrets");
    })
    .catch(function (err) {
      console.log(err);
    });
});

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

app.post("/register", async function (req, res) {
  const newUsername = req.body.username;
  const newPassword = req.body.password;

  try {
    const existingUser = await User.findOne({ username: newUsername });
    if (existingUser) {
      // User already exists, redirect to register with a message
      console.log("already registered");
      return res.render("home", {
        registrationMessage: "User already registered. Please log in.",
      });
    }
    // User doesn't exist, proceed with registration
    User.register({ username: newUsername }, newPassword, function (err, user) {
      if (err) {
        console.log(err);
        console.log("abc");
        res.render("register", {
          registrationMessage: "Registration Failed! Please try again",
        });
      } else {
        passport.authenticate("local")(req, res, function () {
          console.log(req);
          console.log(res);
          res.redirect("/secrets");
        });
      }
    });
  } catch (err) {
    console.log(err);
    res.redirect("/register");
  }
});

app.post("/login", async function (req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });

  try {
    const existingUser = await User.findOne({ username: user.username });

    req.login(user, function (err) {
      if (err) {
        console.log(err);
      } else if (existingUser) {
        passport.authenticate("local", { failureFlash: true })(
          req,
          res,
          function (err) {
            if (err) {
              // Handle other errors if needed
              console.log(err);
              return res.render("login", {
                registrationMessage: "Login Failed! Password is wrong",
              });
            }
            // Authentication successful, redirect to secrets
            res.redirect("/secrets");
          }
        );
      } else {
        return res.render("home", {
          registrationMessage: "User Not Registered! Please Register First",
        });
      }
    });
  } catch (err) {
    console.log(err);
  }
});

app.listen(3000, function () {
  console.log("Server started on port 3000");
});
