export const AWESOME_MATLAB_ROBOTICS_URL =
  "https://github.com/mathworks-robotics/awesome-matlab-robotics";

export const AWESOME_MATLAB_ROBOTICS_LICENSE_URL =
  "https://github.com/mathworks-robotics/awesome-matlab-robotics/blob/master/license.txt";

export const ROBOTICS_LICENSE_NOTE =
  "Links stay external. The source list's license limits redistributed software and derivatives to use with MathWorks products and services; each linked project may also have its own license and toolbox requirements.";

export type RoboticsResourceCategory =
  | "learning"
  | "mobile"
  | "manipulation"
  | "slam"
  | "planning"
  | "control"
  | "simulation"
  | "ros"
  | "hardware"
  | "uav"
  | "toolboxes";

export type RoboticsAccess = "github" | "matlab-central" | "docs" | "video-blog";

export type RoboticsResource = {
  id: string;
  title: string;
  category: RoboticsResourceCategory;
  access: RoboticsAccess;
  url: string;
  description: string;
  sourceSection: string;
  tags: string[];
  requires: string;
  related?: { label: string; url: string }[];
};

export const ROBOTICS_CATEGORY_META: Record<
  RoboticsResourceCategory,
  { label: string; shortLabel: string }
> = {
  learning: { label: "Learning Hubs", shortLabel: "Learning" },
  mobile: { label: "Mobile Robots", shortLabel: "Mobile" },
  manipulation: { label: "Manipulation", shortLabel: "Arms" },
  slam: { label: "Mapping and SLAM", shortLabel: "SLAM" },
  planning: { label: "Path Planning", shortLabel: "Planning" },
  control: { label: "Robot Control", shortLabel: "Control" },
  simulation: { label: "Simulation", shortLabel: "Sim" },
  ros: { label: "ROS and Middleware", shortLabel: "ROS" },
  hardware: { label: "Hardware", shortLabel: "Hardware" },
  uav: { label: "UAV", shortLabel: "UAV" },
  toolboxes: { label: "MATLAB Toolboxes", shortLabel: "Toolboxes" },
};

export const ROBOTICS_ACCESS_META: Record<RoboticsAccess, { label: string; tone: string }> = {
  github: { label: "GitHub", tone: "text-primary border-primary/30 bg-primary/10" },
  "matlab-central": { label: "MATLAB Central", tone: "text-accent border-accent/30 bg-accent/10" },
  docs: { label: "Docs / Example", tone: "text-success border-success/30 bg-success/10" },
  "video-blog": { label: "Video / Blog", tone: "text-warning border-warning/30 bg-warning/10" },
};

export const ROBOTICS_CATEGORIES = Object.keys(
  ROBOTICS_CATEGORY_META
) as RoboticsResourceCategory[];

export const ROBOTICS_RESOURCES: RoboticsResource[] = [
  {
    id: "awesome-matlab-robotics",
    title: "Awesome MATLAB and Simulink Robotics",
    category: "learning",
    access: "github",
    url: AWESOME_MATLAB_ROBOTICS_URL,
    sourceSection: "Repository overview",
    description:
      "The upstream curated index of robotics demos, tutorials, utilities, and overall resources for MATLAB and Simulink users.",
    tags: ["index", "matlab", "simulink", "robotics"],
    requires: "External catalog; individual resources list their own requirements.",
  },
  {
    id: "mobile-robotics-simulation-toolbox",
    title: "Mobile Robotics Simulation Toolbox",
    category: "simulation",
    access: "github",
    url: "https://github.com/mathworks-robotics/mobile-robotics-simulation-toolbox",
    sourceSection: "Simulators",
    description:
      "Mobile robot simulation utilities and examples useful for prototyping UGV navigation and control experiments.",
    tags: ["mobile robots", "simulation", "ugv", "education"],
    requires: "MATLAB; check the project page for toolbox dependencies.",
    related: [
      {
        label: "MATLAB Central entry",
        url: "https://www.mathworks.com/matlabcentral/fileexchange/66586-mobile-robotics-simulation-toolbox",
      },
    ],
  },
  {
    id: "robotics-playground",
    title: "Robotics Playground",
    category: "learning",
    access: "github",
    url: "https://github.com/mathworks-robotics/robotics-playground",
    sourceSection: "Simulators",
    description:
      "Educational robotics virtual worlds that pair well with class projects, demos, and beginner-friendly exploration.",
    tags: ["education", "simulation", "virtual worlds", "teaching"],
    requires: "MATLAB/Simulink; check the project page for exact support packages.",
    related: [
      {
        label: "MATLAB Central entry",
        url: "https://www.mathworks.com/matlabcentral/fileexchange/67157-robotics-playground?s_tid=vid_recs_pers_other_v3",
      },
    ],
  },
  {
    id: "developing-navigation-stacks",
    title: "Developing Navigation Stacks for Mobile Robots and UGV",
    category: "mobile",
    access: "matlab-central",
    url: "https://www.mathworks.com/matlabcentral/fileexchange/95998-autonomous-navigation-for-mobile-robots-and-ugv",
    sourceSection: "Ground Vehicles and Mobile Robotics",
    description:
      "Autonomous navigation stack material for mobile robots and unmanned ground vehicles.",
    tags: ["navigation stack", "ugv", "mobile robots", "autonomy"],
    requires: "MATLAB/Simulink; toolbox requirements are listed on MATLAB Central.",
  },
  {
    id: "kinematic-motion-models",
    title: "Kinematic Motion Models for Simulation",
    category: "mobile",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples/simulate-different-kinematic-models-for-mobile-robots.html",
    sourceSection: "Ground Vehicles and Mobile Robotics",
    description:
      "Examples for differential-drive, bicycle, unicycle, and other mobile robot motion models.",
    tags: ["kinematics", "motion models", "mobile robots", "simulation"],
    requires: "Robotics System Toolbox examples.",
  },
  {
    id: "warehouse-robots",
    title: "Control and Simulation of Warehouse Robots",
    category: "mobile",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples/control-and-simulate-multiple-warehouse-robots.html",
    sourceSection: "Ground Vehicles and Mobile Robotics",
    description:
      "Multi-robot warehouse control and simulation workflow for fleet-style mobile robot problems.",
    tags: ["warehouse", "multi-robot", "control", "simulation"],
    requires: "Robotics System Toolbox examples.",
  },
  {
    id: "inverse-kinematics",
    title: "Inverse Kinematics",
    category: "manipulation",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/inverse-kinematics.html",
    sourceSection: "Manipulation",
    description:
      "Manipulator inverse kinematics reference material for solving joint configurations from end-effector targets.",
    tags: ["manipulator", "inverse kinematics", "rigid body tree"],
    requires: "Robotics System Toolbox examples.",
    related: [
      {
        label: "Companion GitHub repo",
        url: "https://github.com/mathworks-robotics/designing-robot-manipulator-algorithms",
      },
    ],
  },
  {
    id: "trajectory-generation",
    title: "Trajectory Generation for Manipulators",
    category: "manipulation",
    access: "github",
    url: "https://github.com/mathworks-robotics/trajectory-planning-robot-manipulators",
    sourceSection: "Manipulation",
    description:
      "Trajectory planning examples for robot manipulators, including companion material from the MathWorks robotics list.",
    tags: ["trajectory", "manipulator", "planning", "robot arm"],
    requires: "MATLAB; check the repository for toolbox requirements.",
    related: [
      {
        label: "Trajectory generation docs",
        url: "https://www.mathworks.com/help/robotics/trajectory-generation.html",
      },
    ],
  },
  {
    id: "pick-and-place-workflows",
    title: "Pick and Place Workflows",
    category: "manipulation",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples/pick-and-place-workflow-using-stateflow.html",
    sourceSection: "Manipulation",
    description:
      "End-to-end pick-and-place workflow material for connecting planning, logic, and robotic manipulation.",
    tags: ["pick and place", "stateflow", "manipulator", "workflow"],
    requires: "Robotics System Toolbox and related workflow products as listed by MathWorks.",
  },
  {
    id: "lidar-slam-2d",
    title: "2D Lidar SLAM Implementations",
    category: "slam",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ug/implement-simultaneous-localization-and-mapping-with-lidar-scans.html",
    sourceSection: "Mapping, Localization and SLAM",
    description:
      "Offline 2D lidar SLAM workflow for building occupancy maps from scan data.",
    tags: ["slam", "lidar", "mapping", "localization"],
    requires: "Navigation Toolbox examples.",
    related: [
      {
        label: "Online SLAM example",
        url: "https://www.mathworks.com/help/nav/ug/implement-online-simultaneous-localization-and-mapping-with-lidar-scans.html",
      },
    ],
  },
  {
    id: "lidar-slam-3d",
    title: "3D Lidar SLAM Implementation",
    category: "slam",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ug/perform-lidar-slam-using-3d-lidar-point-clouds.html",
    sourceSection: "Mapping, Localization and SLAM",
    description:
      "3D point-cloud SLAM example for lidar-based mapping and localization.",
    tags: ["slam", "3d lidar", "point cloud", "mapping"],
    requires: "Navigation Toolbox and point-cloud workflow support.",
  },
  {
    id: "slam-map-builder",
    title: "SLAM Map Builder Application",
    category: "slam",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ref/slammapbuilder-app.html",
    sourceSection: "Mapping, Localization and SLAM",
    description:
      "App-oriented workflow for building and inspecting SLAM maps from robotics data.",
    tags: ["slam", "map builder", "app", "occupancy grid"],
    requires: "Navigation Toolbox.",
  },
  {
    id: "monte-carlo-localization",
    title: "Monte Carlo Localization",
    category: "slam",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ug/localize-turtlebot-using-monte-carlo-localization.html",
    sourceSection: "Mapping, Localization and SLAM",
    description:
      "Particle-filter localization example for localizing a TurtleBot-style robot on a known map.",
    tags: ["localization", "particle filter", "turtlebot", "navigation"],
    requires: "Navigation Toolbox and relevant robot support packages.",
  },
  {
    id: "motion-planners",
    title: "Motion Planners: RRT, PRM, and Hybrid A*",
    category: "planning",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/motion-planning.html?s_tid=CRUX_lftnav",
    sourceSection: "Motion Planning and Path Planning",
    description:
      "Central reference for planner families used in mobile robotics and autonomous navigation.",
    tags: ["rrt", "prm", "hybrid a star", "path planning"],
    requires: "Navigation Toolbox examples.",
  },
  {
    id: "rrt-mobile-robots",
    title: "RRT Planners for Mobile Robots",
    category: "planning",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ug/plan-mobile-robot-paths-using-rrt.html",
    sourceSection: "Motion Planning and Path Planning",
    description:
      "Rapidly-exploring random tree planning example for mobile robot path generation.",
    tags: ["rrt", "mobile robots", "path planning"],
    requires: "Navigation Toolbox examples.",
  },
  {
    id: "dynamic-replanning",
    title: "Dynamic Re-planning of Paths",
    category: "planning",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ug/dynamic-replanning-on-an-indoor-map.html",
    sourceSection: "Motion Planning and Path Planning",
    description:
      "Path replanning workflow for changing indoor maps and evolving navigation constraints.",
    tags: ["replanning", "indoor map", "navigation", "planning"],
    requires: "Navigation Toolbox examples.",
  },
  {
    id: "path-following-obstacle-avoidance",
    title: "Path Following with Obstacle Avoidance",
    category: "planning",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/ug/path-following-with-obstacle-avoidance-in-simulink.html",
    sourceSection: "Motion Planning and Path Planning",
    description:
      "Simulink workflow that connects path following behavior with obstacle avoidance logic.",
    tags: ["path following", "obstacle avoidance", "simulink", "navigation"],
    requires: "Navigation Toolbox and Simulink workflow support.",
  },
  {
    id: "mpc-kinova-gen3",
    title: "Model Predictive Control for Kinova Gen3 Trajectories",
    category: "control",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples/plan-and-execute-collision-free-trajectory-kinova-gen3.html",
    sourceSection: "Motion Control",
    description:
      "MPC-based collision-free manipulation trajectory example for a Kinova Gen3 robot.",
    tags: ["mpc", "kinova", "trajectory", "collision-free"],
    requires: "Robotics System Toolbox and control workflow products listed by MathWorks.",
  },
  {
    id: "holonomic-mpc",
    title: "Model Predictive Control for Holonomic Robot Navigation",
    category: "control",
    access: "github",
    url: "https://github.com/mathworks-robotics/mobile-robotics-simulation-toolbox/blob/master/examples/matlab/mrsOmniwheelMPCInit.m",
    sourceSection: "Motion Control",
    description:
      "Example initialization file for holonomic/omniwheel MPC navigation from the mobile robotics simulation toolbox.",
    tags: ["mpc", "holonomic", "omniwheel", "navigation"],
    requires: "Mobile Robotics Simulation Toolbox and MATLAB control workflow dependencies.",
  },
  {
    id: "multi-loop-pid-robot-arm",
    title: "Multi-Loop PI Control Tuning for Robotic Arm Actuators",
    category: "control",
    access: "docs",
    url: "https://www.mathworks.com/help/slcontrol/ug/multi-loop-pid-control-of-a-robot-arm.html",
    sourceSection: "Motion Control",
    description:
      "Robot arm actuator tuning example that connects this app's controller identities to a robotics application.",
    tags: ["pi", "pid", "robot arm", "control tuning"],
    requires: "Simulink Control Design example.",
  },
  {
    id: "gazebo-cosimulation",
    title: "Gazebo Co-Simulation",
    category: "simulation",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples/perform-co-simulation-between-simulink-and-gazebo.html",
    sourceSection: "Simulators",
    description:
      "Simulink and Gazebo co-simulation workflow for testing robot models in a physics environment.",
    tags: ["gazebo", "cosimulation", "simulink", "physics"],
    requires: "Simulink, Robotics System Toolbox, and Gazebo setup.",
  },
  {
    id: "unreal-driving-scenarios",
    title: "Unreal Engine-Based Driving Scenarios",
    category: "simulation",
    access: "docs",
    url: "https://www.mathworks.com/help/driving/unreal-engine-driving-scenario-simulation.html",
    sourceSection: "Simulators",
    description:
      "Scenario simulation reference for testing automated-driving behaviors in Unreal Engine environments.",
    tags: ["unreal", "automated driving", "scenario", "simulation"],
    requires: "Automated Driving Toolbox and Unreal Engine simulation support.",
  },
  {
    id: "matlab-ros-ros2",
    title: "MATLAB Support for ROS and ROS 2",
    category: "ros",
    access: "docs",
    url: "https://www.mathworks.com/help/ros/referencelist.html?type=function",
    sourceSection: "ROS and Middleware",
    description:
      "ROS and ROS 2 function reference for building middleware-connected robotics workflows in MATLAB.",
    tags: ["ros", "ros 2", "middleware", "matlab"],
    requires: "ROS Toolbox.",
  },
  {
    id: "simulink-ros-ros2",
    title: "Simulink Support for ROS and ROS 2",
    category: "ros",
    access: "docs",
    url: "https://www.mathworks.com/help/ros/examples.html?category=ros-in-simulink",
    sourceSection: "ROS and Middleware",
    description:
      "Simulink examples for ROS and ROS 2 node, message, and model-based robotics workflows.",
    tags: ["ros", "ros 2", "simulink", "middleware"],
    requires: "ROS Toolbox and Simulink.",
  },
  {
    id: "ros-custom-messages",
    title: "Support for ROS Custom Messages",
    category: "ros",
    access: "docs",
    url: "https://www.mathworks.com/help/ros/ros-and-ros2-custom-message-support.html",
    sourceSection: "ROS and Middleware",
    description:
      "Custom message workflow for connecting MATLAB/Simulink models to project-specific ROS interfaces.",
    tags: ["ros", "custom messages", "interfaces", "middleware"],
    requires: "ROS Toolbox.",
  },
  {
    id: "automatic-ros-node-generation",
    title: "Automatic ROS Node Generation from Simulink",
    category: "ros",
    access: "docs",
    url: "https://www.mathworks.com/help/ros/ug/generate-a-standalone-ros-node-from-simulink.html",
    sourceSection: "ROS and Middleware",
    description:
      "Generate standalone ROS nodes from Simulink models for deployment-oriented robotics projects.",
    tags: ["ros", "node generation", "deployment", "simulink"],
    requires: "ROS Toolbox, Simulink, and code generation products as listed by MathWorks.",
  },
  {
    id: "kinova-support",
    title: "Kinova Robot Support Package",
    category: "hardware",
    access: "matlab-central",
    url: "https://www.mathworks.com/matlabcentral/fileexchange/78438-robotics-system-toolbox-support-package-for-kinova-gen3-manipulators",
    sourceSection: "Hardware and Connectivity",
    description:
      "Support package for Kinova Gen3 manipulators in Robotics System Toolbox workflows.",
    tags: ["kinova", "hardware", "manipulator", "support package"],
    requires: "Robotics System Toolbox and supported Kinova hardware.",
  },
  {
    id: "universal-robots-support",
    title: "Universal Robots Support Package",
    category: "hardware",
    access: "matlab-central",
    url: "https://www.mathworks.com/matlabcentral/fileexchange/117530-robotics-system-toolbox-support-package-for-universal-robots-ur-series-manipulators",
    sourceSection: "Hardware and Connectivity",
    description:
      "Support package for Universal Robots UR-series manipulators.",
    tags: ["universal robots", "hardware", "manipulator", "support package"],
    requires: "Robotics System Toolbox and supported UR hardware.",
  },
  {
    id: "turtlebot-support",
    title: "TurtleBot Robots",
    category: "hardware",
    access: "matlab-central",
    url: "https://www.mathworks.com/matlabcentral/fileexchange/55578-ros-toolbox-support-package-for-turtlebot-based-robots",
    sourceSection: "Hardware and Connectivity",
    description:
      "TurtleBot support package for ROS-connected mobile robot experiments.",
    tags: ["turtlebot", "ros", "mobile robot", "hardware"],
    requires: "ROS Toolbox and supported TurtleBot hardware/simulation setup.",
  },
  {
    id: "uav-library",
    title: "Simulation Library for Fixed-Wing and Multi-Rotor UAVs",
    category: "uav",
    access: "matlab-central",
    url: "https://www.mathworks.com/matlabcentral/fileexchange/68788-robotics-system-toolbox-uav-library",
    sourceSection: "Unmanned Aerial Vehicles",
    description:
      "UAV simulation library for fixed-wing and multi-rotor modeling experiments.",
    tags: ["uav", "drone", "simulation", "fixed wing", "multirotor"],
    requires: "MATLAB/Simulink; toolbox requirements are listed on MATLAB Central.",
  },
  {
    id: "mavlink-tlog",
    title: "Load and Playback MAVLink TLOG",
    category: "uav",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples/load-and-playback-mavlink-tlog.html",
    sourceSection: "Unmanned Aerial Vehicles",
    description:
      "MAVLink telemetry log loading and playback example for UAV analysis workflows.",
    tags: ["uav", "mavlink", "telemetry", "log playback"],
    requires: "Robotics System Toolbox UAV examples.",
  },
  {
    id: "px4-autopilots",
    title: "Support for PX4 Autopilots",
    category: "uav",
    access: "docs",
    url: "https://www.mathworks.com/hardware-support/px4-autopilots.html",
    sourceSection: "Unmanned Aerial Vehicles",
    description:
      "PX4 autopilot support reference for UAV control and deployment projects.",
    tags: ["uav", "px4", "autopilot", "hardware support"],
    requires: "Supported MathWorks hardware support packages.",
  },
  {
    id: "robotics-system-toolbox-examples",
    title: "Robotics System Toolbox Examples",
    category: "toolboxes",
    access: "docs",
    url: "https://www.mathworks.com/help/robotics/examples.html",
    sourceSection: "Relevant MATLAB Toolboxes",
    description:
      "Core MATLAB robotics examples covering modeling, planning, manipulation, and mobile robotics.",
    tags: ["toolbox", "robotics system toolbox", "examples"],
    requires: "Robotics System Toolbox.",
  },
  {
    id: "ros-toolbox-examples",
    title: "ROS Toolbox Examples",
    category: "toolboxes",
    access: "docs",
    url: "https://www.mathworks.com/help/ros/examples.html",
    sourceSection: "Relevant MATLAB Toolboxes",
    description:
      "Example collection for ROS and ROS 2 communication, simulation, and deployment workflows.",
    tags: ["toolbox", "ros", "ros 2", "examples"],
    requires: "ROS Toolbox.",
  },
  {
    id: "navigation-toolbox-examples",
    title: "Navigation Toolbox Examples",
    category: "toolboxes",
    access: "docs",
    url: "https://www.mathworks.com/help/nav/examples.html",
    sourceSection: "Relevant MATLAB Toolboxes",
    description:
      "Navigation examples for mapping, localization, planning, tracking, and mobile robot autonomy.",
    tags: ["toolbox", "navigation", "slam", "planning"],
    requires: "Navigation Toolbox.",
  },
  {
    id: "control-system-toolbox-examples",
    title: "Control System Toolbox Examples",
    category: "toolboxes",
    access: "docs",
    url: "https://www.mathworks.com/help/control/examples.html",
    sourceSection: "Relevant MATLAB Toolboxes",
    description:
      "Control-design examples that connect this app's transfer-function work to MATLAB analysis workflows.",
    tags: ["toolbox", "control", "transfer functions", "frequency response"],
    requires: "Control System Toolbox.",
  },
];

export function getRoboticsResourcesByCategory(
  category: RoboticsResourceCategory
): RoboticsResource[] {
  return ROBOTICS_RESOURCES.filter((resource) => resource.category === category);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueMatchesSearchToken(value: string, token: string): boolean {
  const normalizedValue = value.toLowerCase();
  if (token.length > 3) return normalizedValue.includes(token);

  const termPattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}($|[^a-z0-9])`, "i");
  return termPattern.test(normalizedValue);
}

export function resourceMatchesQuery(resource: RoboticsResource, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const searchableValues = [
    resource.title,
    resource.description,
    resource.sourceSection,
    resource.access,
    resource.requires,
    ...resource.tags,
  ];
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return queryTokens.every((token) =>
    searchableValues.some((value) => valueMatchesSearchToken(value, token))
  );
}
