import {
  AlosaurRequest,
  App,
  Area,
  Context,
  Controller,
  Get,
  Middleware,
  MiddlewareTarget,
  Param,
  Put,
  Req,
} from "https://deno.land/x/alosaur@v0.38.0/mod.ts";
import { decode } from "https://deno.land/std/encoding/base64.ts";
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";

const STORAGE_PATH = "./files/";

@Controller()
export class MainController {
  /**
   * npm publish
   * @param serverRequest
   * @param name of package
   */
  @Put("/:name")
  async publish(
    @Req() { serverRequest }: AlosaurRequest,
    @Param("name") name: string,
  ) {
    const req = await serverRequest.request.json();
    const firstAttachName = Object.keys(req._attachments)[0];
    const directory = firstAttachName.split("/")[0];

    const attach = req._attachments[firstAttachName];
    const data = attach.data;

    await Deno.mkdir(STORAGE_PATH + directory, { recursive: true });
    await Deno.writeFile(STORAGE_PATH + firstAttachName, decode(data));

    delete req._attachments;
    await this.updateManifest(req);

    return "OK";
  }

  @Get()
  async indexPage() {
      const result = [];

      for await (const entry of walk(STORAGE_PATH)) {
        if(entry.isFile && /\.json/.test(entry.path)) {
          result.push(entry.path.replace('files/','').replace('.json',''))
        }
      }

      return result;
  }

  /**
   * Get manifest of package, show versions
   * /@myscope/test-package
   * check in npm install
   * content-type: application/json
   */
  @Get("/:scope/:name")
  async getManifestScope(
    @Param("scope") scope: string,
    @Param("name") name: string,
  ) {
    return await this.getManifest(scope, name);
  }

  @Get("/:scopeName")
  async getManifestAll(@Param("scopeName") scopeName: string) {
    const [scope, name] = decodeURIComponent(scopeName).split("/");

    return await this.getManifest(scope, name);
  }

  private async getManifest(scope: string, name: string) {
    try {
      const filePath = `${STORAGE_PATH}${scope}/${name}.json`;
      return JSON.parse(await Deno.readTextFile(filePath));
    } catch {
      return new Response("not found", {
        status: 404,
      });
    }
  }

  /**
   * Update manifest of packages
   */
  private async updateManifest(manifest: Object): any {
    const filePath = `./files/${manifest.name}.json`;
    let versions = {};

    try {
      const manifest = JSON.parse(await Deno.readTextFile(filePath));
      versions = manifest.versions;
    } catch (e) {
    }

    manifest.versions = { ...versions, ...manifest.versions };

    return Deno.writeTextFile(filePath, JSON.stringify(manifest));
  }
}

/**
 * Uses for npm install
 * /@myscope/test-package/-/@myscope/test-package-1.2.0.tgz
 */
@Middleware(new RegExp(".tgz"))
export class DownloadMiddleware implements MiddlewareTarget<TState> {
  async onPreRequest(context: Context<TState>) {
    return new Promise<void>(async (resolve, reject) => {
      const pathname = new URL(context.request.url).pathname;
      const filepath = pathname.split("/-/")[1];

      try {
        const file = await Deno.open(STORAGE_PATH + filepath, { read: true });
        const response = new Response(file.readable);
        await context.request.serverRequest.respondWith(response);

        context.response.setNotRespond();
      } catch {
        resolve();
      }
    });
  }

  onPostRequest(context: Context<TState>) {
    // no need
  }
}

// Declare module
@Area({
  controllers: [MainController],
})
export class RegistryArea {}

// Create alosaur application
const app = new App({
  areas: [RegistryArea],
  middlewares: [DownloadMiddleware],
});

app.listen();
