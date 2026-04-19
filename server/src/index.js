require("dotenv").config();

const app = require("./app");
const { connectMongo } = require("./lib/mongo");

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("HF KEY LOADED:", process.env.HUGGINGFACE_API_KEY?.slice(0, 10));
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
