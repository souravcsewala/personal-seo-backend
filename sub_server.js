const express = require("express");
// const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");

const { DataBaseconnection } = require("./database/db");
const errorMiddliware = require("./middileware/errorMiddileware");

const blogRoutes = require("./routes/blogRoutes");
const questionRoutes = require("./routes/questionRoutes");
const pollRoutes = require("./routes/pollRoutes");
const adminRoutes = require("./routes/adminRoutes");
const feedRoutes = require("./routes/feedRoutes");
const { startTrendingScheduler } = require("./special/trendingScheduler");
const authRoutes = require("./routes/AuthRoute");
const categoryRoutes = require("./routes/categoryRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const pushRoutes = require("./routes/pushRoutes");

const sub_server = express();

sub_server.set("trust proxy", true);

sub_server.use(express.json());
// sub_server.use(cookieParser());
sub_server.use(bodyParser.urlencoded({ extended: true }));
sub_server.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

const corsOptions = {
  origin: "*",
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD",
  credentials: false,
};
sub_server.use(cors(corsOptions));

sub_server.use(
  morgan(
    ":method :url :status :res[content-length] - :response-time ms  Client-Ip: :remote-addr "
  )
);

const startDatabase = async () => {
  try {
    await DataBaseconnection();
  } catch (error) {
    // Forward DB init errors to the error middleware
    sub_server.use((req, res, next) => next(error));
  }
};
startDatabase();
// start trending scheduler after DB connects
startTrendingScheduler();

sub_server.get("/", (req, res) => {
  res.send("Server is Up and Running blog system");
});

sub_server.use("/api/blogs", blogRoutes);
sub_server.use("/api/questions", questionRoutes);
sub_server.use("/api/polls", pollRoutes);
sub_server.use("/api/admin", adminRoutes);
sub_server.use("/api/feed", feedRoutes);
sub_server.use("/api/auth", authRoutes);
sub_server.use("/api", categoryRoutes);
sub_server.use("/api/announcements", announcementRoutes);
sub_server.use("/api/push", pushRoutes);
sub_server.use(errorMiddliware);

module.exports = { sub_server };
