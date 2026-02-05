import { execSync } from "child_process";

jest.setTimeout(20000);

beforeAll(() => {
  execSync("pnpm build");
});

afterAll(() => {});
