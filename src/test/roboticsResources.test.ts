import { describe, expect, it } from "vitest";
import {
  AWESOME_MATLAB_ROBOTICS_URL,
  ROBOTICS_CATEGORIES,
  ROBOTICS_CATEGORY_META,
  ROBOTICS_RESOURCES,
  getRoboticsResourcesByCategory,
  resourceMatchesQuery,
} from "@/lib/roboticsResources";

describe("robotics resource hub", () => {
  it("catalogs the major freeware/resource areas from the MathWorks robotics list", () => {
    const ids = ROBOTICS_RESOURCES.map((resource) => resource.id);

    expect(AWESOME_MATLAB_ROBOTICS_URL).toBe(
      "https://github.com/mathworks-robotics/awesome-matlab-robotics"
    );
    expect(ROBOTICS_RESOURCES.length).toBeGreaterThanOrEqual(30);
    expect(ids).toEqual(
      expect.arrayContaining([
        "mobile-robotics-simulation-toolbox",
        "robotics-playground",
        "lidar-slam-2d",
        "matlab-ros-ros2",
        "multi-loop-pid-robot-arm",
        "uav-library",
      ])
    );
  });

  it("keeps every resource linked externally with category metadata", () => {
    const ids = new Set<string>();

    for (const resource of ROBOTICS_RESOURCES) {
      expect(ids.has(resource.id)).toBe(false);
      ids.add(resource.id);

      expect(resource.url).toMatch(/^https:\/\//);
      expect(ROBOTICS_CATEGORIES).toContain(resource.category);
      expect(ROBOTICS_CATEGORY_META[resource.category].label).toBeTruthy();
      expect(resource.tags.length).toBeGreaterThan(0);
      expect(resource.requires).toBeTruthy();

      for (const link of resource.related ?? []) {
        expect(link.url).toMatch(/^https:\/\//);
        expect(link.label).toBeTruthy();
      }
    }
  });

  it("filters by category and text query for common robotics workflows", () => {
    expect(getRoboticsResourcesByCategory("ros").map((resource) => resource.id)).toEqual(
      expect.arrayContaining(["matlab-ros-ros2", "automatic-ros-node-generation"])
    );

    expect(
      ROBOTICS_RESOURCES.filter((resource) => resourceMatchesQuery(resource, "SLAM")).map(
        (resource) => resource.id
      )
    ).toEqual(expect.arrayContaining(["lidar-slam-2d", "slam-map-builder"]));

    const pidMatches = ROBOTICS_RESOURCES.filter((resource) =>
      resourceMatchesQuery(resource, "PID")
    ).map((resource) => resource.id);

    expect(pidMatches).toEqual(expect.arrayContaining(["multi-loop-pid-robot-arm"]));
    expect(pidMatches).not.toContain("rrt-mobile-robots");
  });
});
