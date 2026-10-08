using System;
using System.Collections.Generic;
using UnityEngine;

namespace StretchSense.Retargeting
{
    public class RetargetHelper
    {
        // Enum used to select which of the bend paths to evaluate. Currently there are two possible paths: BEND = bend with 0% splay, and SPLAY = 100% Splay
        public enum PathType
        {
            BEND = 0,
            SPLAY = 1,
            TWIST = 2,
        }

        //// Pre-allocated quaternions for use in workings for bend and splay joints to save creating them every frame.
        //private Quaternion q1 = new Quaternion();
        //private Quaternion q2 = new Quaternion();

        // === REFERENCE POSES ====================================================================

        // Function to store the joint names and local rotations of the hand asset into a reference pose
        public ReferencePose PopulateReferencePose(ReferencePose referencePose, Transform parentTransform)
        {
            // If the wrist root transform has not been specified then return the input value
            if (parentTransform == null)
                return referencePose;

            // Loop through every child of the wrist root and store the name of the child and their local rotation quaternion for use in retargeting
            foreach (Transform child in parentTransform)
            {
                // Add child name to target joint name list
                referencePose.names.Add(child.name);
                referencePose.quats.Add(child.transform.localRotation);

                // Recursively add names of this child's children, and so on.
                PopulateReferencePose(referencePose, child);
            }

            // Return the updated reference pose
            return referencePose;
        }

        /**
         * Function to apply a reference pose to a hand asset
         *
         * @param rp: The reference pose to apply
         * @param wristRoot: The transform of the wrist root of the hand asset
         */
        public void ApplyPreview(ReferencePose rp, Transform wristRoot)
        {
            if (wristRoot == null)
            {
                return;
            }

            // Create a local variable
            Transform joint;

            // Loop through each joint name in the reference pose, find its transform, and apply the corresponding rotation
            foreach (string name in rp.names)
            {
                // Find index of joint name
                int index = rp.names.IndexOf(name);

                // Find transform of target joint
                joint = FindDeepChild(wristRoot, name);

                // IF a joint is found, apply the corresponding quaternion to the joint
                if (joint != null)
                {
                    joint.localRotation = rp.quats[index];
                }
            }
        }

        // === JOINT UPDATES ======================================================================

        // A function to add a JointPose to a table for batch processing of animation updates
        public List<JointPose> UpdateJointTable(List<TargetTransform> targetTransforms, Dictionary<string, float> rigControlValues)
        {
            // Create an empty table
            List<JointPose> jointPoseTable = new List<JointPose>();

            // Skip if rigControlValues is empty
            if (rigControlValues.Count == 0)
            {
                return jointPoseTable;
            }

            foreach (TargetTransform tt in targetTransforms)
            {
                jointPoseTable = AddJointPose(jointPoseTable, rigControlValues, tt);
            }

            return jointPoseTable;
        }

        // Add a joint pose to the table of joint poses that will be applied as a batch to the hand asset
        public List<JointPose> AddJointPose(
            List<JointPose> jointPoseTable,
            Dictionary<string, float> rigControlValues,
            TargetTransform targetTransform
        )
        {
            // NOTE: In the current implementation if a slider has a negative value at this point it is assumed to be allowed and will be processed as valid.

            // Initialise variable for bend
            Quaternion bendOutput1;

            // Initialise flag indicating if the rig value is negative and set it to false
            bool inputBendNegative = false;

            // Get the rig value for the slider that drives the target transform
            float inputBend = rigControlValues[targetTransform.bendDriver];

            // Test if the input is negative and take absolute value and set negative flag if it is.
            if (inputBend < 0)
            {
                inputBend = Math.Abs(inputBend);
                inputBendNegative = true;
            }

            // Exit early if the input is out of the range of interest for the input target transform
            if (inputBend < targetTransform.bendStart || inputBend > targetTransform.bendEnd)
                return jointPoseTable;

            // Normalise the input to the range of interest
            inputBend = (inputBend - targetTransform.bendStart) / (targetTransform.bendEnd - targetTransform.bendStart);

            // Calculate the first bending quaternion (used by all joint types)
            bendOutput1 = GetBendOutput(targetTransform, PathType.BEND, inputBend, inputBendNegative);

            // For BEND-type joints, all necessary calcs are complete, so add results to jointPoseTable and return from AddJointPose function
            if (targetTransform.jointType == JointType.BEND)
            {
                // Add joint pose to table
                jointPoseTable.Add(new JointPose { joint = targetTransform.target, quat = bendOutput1 });

                return jointPoseTable;
            }

            // Continues for BENDSPLAY-type joints...

            // Initialise additional required variables
            Quaternion bendOutput2;
            Quaternion splayOutput;

            // Calculate teh intermediary quaternion along the splay path using bend
            bendOutput2 = GetBendOutput(targetTransform, PathType.SPLAY, inputBend, inputBendNegative);

            // Initialise flag indicating if the splay rig value is negative and set it to false
            bool inputSplayNegative = false;

            // Get the rig value for the slider that drives the target transform's splay
            float inputSplay = rigControlValues[targetTransform.splayDriver];

            // Test if the input is negative. Take the absolute value and set negative flag if it is.
            if (inputSplay < 0)
            {
                inputSplay = Math.Abs(inputSplay);
                inputSplayNegative = true;
            }

            // Calculate the final rotation including splay based on the two intermediary bend quaternions and the sign of the bend and splay
            splayOutput = GetSplayOutput(targetTransform, bendOutput1, bendOutput2, inputBendNegative, inputSplay, inputSplayNegative);

            // For BEND-type joints, all necessary calcs are complete, so add results to jointPoseTable and return from AddJointPose function
            if (targetTransform.jointType == JointType.BENDSPLAY)
            {
                // Add joint pose to table
                jointPoseTable.Add(new JointPose { joint = targetTransform.target, quat = splayOutput });

                // Return from function
                return jointPoseTable;
            }

            float inputTwist = rigControlValues[targetTransform.twistDriver];

            // Test if the input is negative and take absolute value and set negative flag if it is.
            if (inputTwist < 0)
            {
                inputTwist = 0;
            }
            else if (inputTwist > 1)
            {
                inputTwist = 1;
            }

            Quaternion twistOutput;

            twistOutput = GetTwistOutput(targetTransform, inputTwist);

            // Add joint pose to table
            jointPoseTable.Add(new JointPose { joint = targetTransform.target, quat = splayOutput * twistOutput });

            // Return from function
            return jointPoseTable;
        }

        // Function to evaluate the intermediary bend quaternion for a given slerp
        public Quaternion GetBendOutput(TargetTransform targetTransform, PathType path, float inputBend, bool inputBendNegative)
        {
            // Initialise a unit quaternion to be updated by this function
            Quaternion output = Quaternion.identity;

            // Calculate the intermediary bend quaternion for the zerp splay path
            if (path == PathType.BEND)
            {
                output = Quaternion.Slerp(targetTransform.startQuat1, targetTransform.endQuat1, inputBend);
            }

            // Calculate the intermediary bend quaternion for the maximum splay path
            if (path == PathType.SPLAY)
            {
                output = Quaternion.Slerp(targetTransform.startQuat2, targetTransform.endQuat2, inputBend);
            }

            // If the bend slider is negative, reflect the output about the zeroPose point for that joint
            if (inputBendNegative)
            {
                // Calculate the difference quaternion to go from the intermediary quaternion to the zero position
                Quaternion quatDiff = targetTransform.zeroQuat * Quaternion.Inverse(output);

                // Double the angle by squaring the difference quaternion to get the rotation quaternion to go from the intermediary quaternion to its antipode using the zero position as the centerpoint
                Quaternion doubledQuatDiff = quatDiff * quatDiff;

                // Final rotation is taken starting from the positive output rotation an double applying the reverse rotation
                output = doubledQuatDiff * output; // TODO: validate this order of operations is correct for all conditions
            }

            // Return from function
            return output;
        }

        // Function to evaluate the final quaternion that is the result of slerping between two intermediary bend quaternions
        public Quaternion GetSplayOutput(
            TargetTransform targetTransform,
            Quaternion bendOutput1,
            Quaternion bendOutput2,
            bool inputBendNegative,
            float inputSplay,
            bool inputSplayNegative
        )
        {
            // Calculate the default final quaternion
            Quaternion output = Quaternion.Slerp(bendOutput1, bendOutput2, inputSplay);

            // If Bend and Splay are teh same sign, no further calculations are required and return output
            if (inputBendNegative == inputSplayNegative)
            {
                return output;
            }

            // Continues for case where bend and splay have opposite signs...

            // Reflect the final output across the Bend Path line
            // Calculate the difference quaternion to go from the intermediary quaternion to the zero position
            Quaternion intermediateOutput = bendOutput1 * Quaternion.Inverse(output);

            // Double the angle by squaring the difference quaternion to get the rotation quaternion to go from the intermediary quaternion to its antipode using the zero position as the centerpoint
            Quaternion doubledIntermediateOutput = intermediateOutput * intermediateOutput;

            // Final rotation is taken starting from the positive output rotation an double applying the reverse rotation
            output = doubledIntermediateOutput * output; // TODO: validate this order of operations is correct for all conditions

            // Return from function
            return output;
        }

        // Function to evaluate the final quaternion that is the result of slerping between two intermediary bend quaternions
        public Quaternion GetTwistOutput(TargetTransform targetTransform, float inputTwist)
        {
            // Calculate the default final quaternion
            Quaternion twistQuaternion = targetTransform.endQuat3 * Quaternion.Inverse(targetTransform.startQuat3);
            Quaternion interpolatedTwistOutput = Quaternion.Slerp(Quaternion.identity, twistQuaternion, inputTwist);

            // Return from function
            return interpolatedTwistOutput;
        }

        // A function to apply the final rotations to each target joint that appears in the joint pose table
        public void UpdateJointRotations(List<JointPose> jointPoseTable)
        {
            foreach (JointPose jp in jointPoseTable)
            {
                jp.joint.localRotation = jp.quat;
            }
        }

        // === TARGET TRANSFORMS ==================================================================

        // A function to initialise the Target Transforms based on the Hand Asset Mapping configuration
        public List<TargetTransform> PopulateTargetTransforms(
            Handedness hand,
            Transform wristRoot,
            HandAssetMapping handAssetMapping,
            List<TargetTransform> targetTransforms,
            ReferencePose zPose
        )
        {
            // Exit early if the wrist root or the hand asset mapping is not specified
            if (wristRoot == null || handAssetMapping == null)
            {
                return targetTransforms;
            }

            // Add the target transforms to the list of target transforms
            // Thumb
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.thumbCMC, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.thumbMCP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.thumbDIP, zPose);

            // Index finger
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.indexCMC, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.indexMCP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.indexPIP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.indexDIP, zPose);

            // Middle finger
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.middleCMC, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.middleMCP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.middlePIP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.middleDIP, zPose);

            // Ring finger
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.ringCMC, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.ringMCP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.ringPIP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.ringDIP, zPose);

            // Pinky finger
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.pinkyCMC, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.pinkyMCP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.pinkyPIP, zPose);
            targetTransforms = AddTarget(hand, wristRoot, targetTransforms, handAssetMapping.pinkyDIP, zPose);

            return targetTransforms;
        }

        // Function to use the reference in the Hand Asset Mapping scriptable object to pre-populate the information required to efficiently do the quaternion slerps for retargeting
        public List<TargetTransform> AddTarget(
            Handedness hand,
            Transform wristRoot,
            List<TargetTransform> targetTransforms,
            List<JointRom> jointList,
            ReferencePose zPose
        )
        {
            // If there are no BendSplayJoints in the list, return the input unchanged
            if (jointList == null || wristRoot == null)
                return targetTransforms;

            // For each BendSplayJoint definition in the list of Bend Splay Joints (there could be more than one if there is an intermediary pose the joint moves through
            foreach (JointRom j in jointList)
            {
                // If the target joint or the bend driver has not been specified, then skip ahead
                if (j.target == "" || j.bendDriver == RigControl.Name.NONE)
                {
                    continue;
                }

                String bendDriverName = Enum.GetName(typeof(RigControl.Name), j.bendDriver);
                String splayDriverName = Enum.GetName(typeof(RigControl.Name), j.splayDriver);
                String twistDriverName = Enum.GetName(typeof(RigControl.Name), j.twistDriver);

                if (!ValidateJointRom(j, wristRoot))
                {
                    string invalidHand = (hand == Handedness.LEFT) ? "LEFT" : "RIGHT";
                    Debug.LogError(
                        $"An error in the Hand Asset Mapping was detected. Please check the {invalidHand} hand and any Joint ROMs that use {bendDriverName}. Ensure the Reference Poses specified are for the correct hand."
                    );
                }

                // Add a new target transform to the list for quick access to the necessary information
                TargetTransform newTargetTransform = new TargetTransform
                {
                    jointType = j.jointType,
                    target = FindDeepChild(wristRoot, j.target),
                    bendDriver = (hand == Handedness.LEFT) ? $"L_{bendDriverName}" : $"R_{bendDriverName}",
                    bendStart = j.bendStart,
                    bendEnd = j.bendEnd,
                    startQuat1 = (j.startPose1 == null) ? Quaternion.identity : j.startPose1.quats[j.startPose1.names.IndexOf(j.target)],
                    endQuat1 = (j.endPose1 == null) ? Quaternion.identity : j.endPose1.quats[j.endPose1.names.IndexOf(j.target)],
                    startQuat2 = (j.startPose2 == null) ? Quaternion.identity : j.startPose2.quats[j.startPose2.names.IndexOf(j.target)],
                    endQuat2 = (j.endPose2 == null) ? Quaternion.identity : j.endPose2.quats[j.endPose2.names.IndexOf(j.target)],
                    startQuat3 = (j.startPose3 == null) ? Quaternion.identity : j.startPose3.quats[j.startPose3.names.IndexOf(j.target)],
                    endQuat3 = (j.endPose3 == null) ? Quaternion.identity : j.endPose3.quats[j.endPose3.names.IndexOf(j.target)],
                    splayDriver = (hand == Handedness.LEFT) ? $"L_{splayDriverName}" : $"R_{splayDriverName}",
                    twistDriver = (hand == Handedness.LEFT) ? $"L_{twistDriverName}" : $"R_{twistDriverName}",
                    // If a zero pose is specified, use the (string) name of the target joint to look up the quaternion of that joint from the zeroPose Scriptabel Object. Otherwise return identity quaternion to avoid null reference errors later
                    zeroQuat = (zPose != null) ? zPose.quats[zPose.names.IndexOf(j.target)] : Quaternion.identity,
                };

                // Add the new target transform to the target transform list
                targetTransforms.Add(newTargetTransform);
            }

            // Return the updated target transform list
            return targetTransforms;
        }

        // === UTILITY FUNCTIONS ==================================================================

        public bool ValidateJointRom(JointRom j, Transform wristRoot)
        {
            if (FindDeepChild(wristRoot, j.target) == null)
            {
                return false;
            }
            ;

            if (j.startPose1 != null && j.startPose1.names.IndexOf(j.target) == -1)
            {
                return false;
            }
            if (j.endPose1 != null && j.endPose1.names.IndexOf(j.target) == -1)
            {
                return false;
            }
            if (j.startPose2 != null && j.startPose2.names.IndexOf(j.target) == -1)
            {
                return false;
            }
            if (j.endPose2 != null && j.endPose2.names.IndexOf(j.target) == -1)
            {
                return false;
            }
            if (j.startPose3 != null && j.startPose3.names.IndexOf(j.target) == -1)
            {
                return false;
            }
            if (j.endPose3 != null && j.endPose3.names.IndexOf(j.target) == -1)
            {
                return false;
            }

            return true;
        }

        // Function to find a joint transform with recursive searching
        public Transform FindDeepChild(Transform parent, string childName)
        {
            if (parent == null)
                return null;

            foreach (Transform child in parent)
            {
                if (child.name == childName)
                    return child;

                Transform result = FindDeepChild(child, childName);
                if (result != null)
                    return result;
            }
            return null;
        }
    }
}
