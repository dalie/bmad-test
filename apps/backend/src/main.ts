import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "img-src": ["'self'", "data:", "https://image.tmdb.org"],
        },
      },
    }),
  );
  app.setGlobalPrefix("api");

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  if (Number.isNaN(port)) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }
  await app.listen(port, "::");
}
bootstrap();
