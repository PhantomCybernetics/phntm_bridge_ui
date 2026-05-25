// GoalStatus https://docs.ros.org/en/ros2_packages/rolling/api/action_msgs/msg/GoalStatus.html
export const GOAL_STATUS = {
    UNKNOWN:   0,
    ACCEPTED:  1,
    EXECUTING: 2,
    CANCELING: 3,
    SUCCEEDED: 4,
    CANCELED:  5,
    ABORTED:   6
};

// duration of the error wobble animation
export const WOBBLE_DURATION = 600;