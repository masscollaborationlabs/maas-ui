import repositories from "./repositories";

describe("repositories", () => {
  it("can get repository items", () => {
    const state = {
      repositories: {
        items: [{ name: "default" }]
      }
    };
    expect(repositories.get(state)).toEqual([{ name: "default" }]);
  });
});
