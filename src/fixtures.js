import { pathJoin, dirnameForModule } from "@compas/stdlib";

const FIXTURES_DIR = pathJoin(dirnameForModule(import.meta), "../__fixtures__");

export const fixtures = {
  imageFile: {
    name: "image.jpg",
    path: pathJoin(FIXTURES_DIR, "image.jpg"),
    type: "image/jpeg",
  },
};
