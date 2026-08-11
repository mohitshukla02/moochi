import { describe, it, expect } from "vitest";
import { normalizeRatings } from "./ratings";

describe("normalizeRatings", () => {
  it("maps all three sources", () => {
    expect(
      normalizeRatings([
        { Source: "Internet Movie Database", Value: "9.0/10" },
        { Source: "Rotten Tomatoes", Value: "94%" },
        { Source: "Metacritic", Value: "84/100" },
      ])
    ).toEqual({ imdb: "9.0/10", rt: "94%", metacritic: "84/100" });
  });

  it("nulls Rotten Tomatoes when absent", () => {
    expect(
      normalizeRatings([
        { Source: "Internet Movie Database", Value: "7.1/10" },
      ])
    ).toEqual({ imdb: "7.1/10", rt: null, metacritic: null });
  });

  it("nulls everything for an empty array", () => {
    expect(normalizeRatings([])).toEqual({
      imdb: null,
      rt: null,
      metacritic: null,
    });
  });

  it("nulls everything when the array is missing entirely", () => {
    expect(normalizeRatings(undefined)).toEqual({
      imdb: null,
      rt: null,
      metacritic: null,
    });
  });

  it("ignores unknown sources", () => {
    expect(
      normalizeRatings([
        { Source: "Some New Aggregator", Value: "5 stars" },
        { Source: "Rotten Tomatoes", Value: "60%" },
      ])
    ).toEqual({ imdb: null, rt: "60%", metacritic: null });
  });

  it("treats OMDb's N/A string as absent", () => {
    expect(
      normalizeRatings([{ Source: "Rotten Tomatoes", Value: "N/A" }])
    ).toEqual({ imdb: null, rt: null, metacritic: null });
  });

  it("is order independent", () => {
    expect(
      normalizeRatings([
        { Source: "Metacritic", Value: "50/100" },
        { Source: "Internet Movie Database", Value: "6.0/10" },
      ])
    ).toEqual({ imdb: "6.0/10", rt: null, metacritic: "50/100" });
  });

  it("ignores inherited Object properties as sources", () => {
    expect(
      normalizeRatings([
        { Source: "toString", Value: "junk" },
        { Source: "constructor", Value: "junk" },
        { Source: "Rotten Tomatoes", Value: "77%" },
      ])
    ).toEqual({ imdb: null, rt: "77%", metacritic: null });
  });
});
