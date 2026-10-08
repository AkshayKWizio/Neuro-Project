using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace StretchSense.Retargeting
{
#if UNITY_2019_1_OR_NEWER
    [ExecuteAlways]
#else
    [ExecuteInEditMode]
#endif
    public class RetargetHand : MonoBehaviour
    {
        [SerializeField, Tooltip("The model of glove compatible with this retargeter")]
        private GloveType _gloveType = GloveType.REALITY;
        public GloveType GloveType
        {
            get => _gloveType;
            set => _gloveType = value;
        }

        [SerializeField, Tooltip("Select which of the performer's hands is driving the target hand")]
        private Handedness _sourceHand = Handedness.UNKNOWN;
        public Handedness SourceHand
        {
            get => _sourceHand;
            set => _sourceHand = value;
        }

        [SerializeField, Tooltip("Drag the wrist root game object of your hand/character from the scene hierarchy to here")]
        private Transform _wristRoot;
        public Transform WristRoot
        {
            get => _wristRoot;
            set => _wristRoot = value;
        }

        [SerializeField, Tooltip("Check to trigger the retargeting operations from an external script.")]
        public bool UseExternalTrigger = false;

        [SerializeField, Tooltip("Check to drive asset with sliders from Edit Mode")]
        public bool RunSlidersInEditMode = false;

        [SerializeField, Tooltip("Checking this option will animate the hands with the calculated joint quaternions.")]
        public bool EnableHandAnimation = true;

        [SerializeField, Tooltip("Slider values")]
        public RigControl.Slider RigSliders;

        [SerializeField, Tooltip("These are the values of the rig controls coming from the Hand Engine Client")]
        public Dictionary<string, float> RigControlValues = new Dictionary<string, float>();

        [SerializeField, Tooltip("Enable to view Advanced Configuration options.")]
        public bool ShowAdvancedOptions = false;

        [SerializeField, Tooltip("Drag a 'Target Joint Name' scriptable object…")]
        public TargetJointNames TargetJointNameList;

        [Tooltip("The key reference poses used…"), SerializeField]
        public KeyPose KeyPoses = new KeyPose();

        [Tooltip("This is a list of arbitrary reference poses…"), SerializeField]
        public List<ReferencePose> ReferencePoseList;

        [Tooltip("This is the hand pose corresponding to zero values…"), SerializeField]
        public ReferencePose ZeroPose;

        [Tooltip("Choose a 'Hand Asset Mapping' scriptable object…"), SerializeField]
        public HandAssetMapping HandAssetMapping;

        [SerializeField, HideInInspector, Tooltip("Use Advanced Mode (default to true)")]
        public bool UseAdvancedMode = true;

        [SerializeField, Tooltip("Select when to apply hand animation data onto the target hand.")]
        private RetargetUpdateMode _updateOrder = RetargetUpdateMode.LATEUPDATE;
        public RetargetUpdateMode UpdateOrder
        {
            get => _updateOrder;
            set => _updateOrder = value;
        }

        [HideInInspector]
        private GloveType[] GlovesWithReducedSliders = new[] { GloveType.STUDIO };

        [HideInInspector]
        public RetargetHelper RetargetHelper = new RetargetHelper();

        [HideInInspector]
        public List<TargetTransform> TargetTransforms = new List<TargetTransform>();

        [HideInInspector]
        private List<JointPose> _jointPoseTable;

        private bool _initialized;

        protected virtual void OnEnable()
        {
            EnsureInitialized();
        }

        public virtual void Start()
        {
            // In builds, this is harmless; in Editor, lets you drive in Edit Mode when toggled.
            if (!Application.isPlaying && !RunSlidersInEditMode)
                return;

            EnsureInitialized();
            PushPoseIfAllowed();
        }

        private void EnsureInitialized()
        {
            // No Editor APIs here—safe for runtime & packages.
            if (!Application.isPlaying && !RunSlidersInEditMode)
                return;

            if (_initialized && TargetTransforms != null && TargetTransforms.Count > 0)
                return;

            if (TargetTransforms == null || TargetTransforms.Count == 0)
                InitialiseTargetTransforms();

            _initialized = TargetTransforms != null && TargetTransforms.Count > 0;
        }

        private void PushPoseIfAllowed()
        {
            if (Application.isPlaying || RunSlidersInEditMode)
                DoRetarget();
        }

        public void InitialiseTargetTransforms()
        {
            if (HandAssetMapping == null)
                return;

            if (HandAssetMapping.mode == HandAssetMappingMode.SIMPLE)
            {
                HandAssetMapping.UpdateHamSimpleReferences(KeyPoses, _gloveType);
                ZeroPose = KeyPoses.paddle;
            }

            TargetTransforms = RetargetHelper.PopulateTargetTransforms(
                SourceHand,
                WristRoot,
                HandAssetMapping,
                new List<TargetTransform>(),
                ZeroPose
            );
        }

        public virtual void Update()
        {
            if ((!Application.isPlaying && !RunSlidersInEditMode) || UseExternalTrigger)
                return;
            if (_updateOrder == RetargetUpdateMode.UPDATE)
                DoRetarget();
        }

        public virtual void FixedUpdate()
        {
            if (!Application.isPlaying || UseExternalTrigger)
                return;
            if (_updateOrder == RetargetUpdateMode.FIXEDUPDATE)
                DoRetarget();
        }

        public virtual void LateUpdate()
        {
            if ((!Application.isPlaying && !RunSlidersInEditMode) || UseExternalTrigger)
                return;
            if (_updateOrder == RetargetUpdateMode.LATEUPDATE)
                DoRetarget();
        }

        public void DoRetarget()
        {
            RigControlValues = UpdateControlRigValues(GloveType, SourceHand, RigSliders);
            if (TargetTransforms == null)
                return;

            _jointPoseTable = RetargetHelper.UpdateJointTable(TargetTransforms, RigControlValues);

            if (EnableHandAnimation)
                RetargetHelper.UpdateJointRotations(_jointPoseTable);
        }

        public List<JointPose> DoRetarget(Dictionary<string, float> rigControlValues)
        {
            if (TargetTransforms == null)
                return new List<JointPose>();

            _jointPoseTable = RetargetHelper.UpdateJointTable(TargetTransforms, rigControlValues);

            if (EnableHandAnimation)
                RetargetHelper.UpdateJointRotations(_jointPoseTable);

            return _jointPoseTable;
        }

        public Dictionary<string, float> UpdateControlRigValues(GloveType gloveType, Handedness source, RigControl.Slider sliders)
        {
            var rigValues = new Dictionary<string, float>();
            if (source == Handedness.UNKNOWN)
            {
                Debug.LogWarning("Source Hand not set.");
                return rigValues;
            }

            string p = (source == Handedness.LEFT) ? "L_" : "R_";
            bool reduced = GlovesWithReducedSliders.Contains(gloveType);

            rigValues[p + "THUMBSPLAY"] = sliders.thumbSplay;
            rigValues[p + "THUMBBEND1"] = sliders.thumbBend1;
            rigValues[p + "THUMBBEND2"] = sliders.thumbBend2;
            rigValues[p + "THUMBBEND3"] = reduced ? sliders.thumbBend2 : sliders.thumbBend3;
            rigValues[p + "INDEXSPLAY"] = reduced ? sliders.globalSplay : sliders.indexSplay;
            rigValues[p + "INDEXBEND1"] = sliders.indexBend1;
            rigValues[p + "INDEXBEND2"] = sliders.indexBend2;
            rigValues[p + "INDEXBEND3"] = reduced ? sliders.indexBend2 : sliders.indexBend3;
            rigValues[p + "MIDDLESPLAY"] = reduced ? sliders.globalSplay : sliders.middleSplay;
            rigValues[p + "MIDDLEBEND1"] = sliders.middleBend1;
            rigValues[p + "MIDDLEBEND2"] = sliders.middleBend2;
            rigValues[p + "MIDDLEBEND3"] = reduced ? sliders.middleBend2 : sliders.middleBend3;
            rigValues[p + "RINGSPLAY"] = reduced ? sliders.globalSplay : sliders.ringSplay;
            rigValues[p + "RINGBEND1"] = sliders.ringBend1;
            rigValues[p + "RINGBEND2"] = sliders.ringBend2;
            rigValues[p + "RINGBEND3"] = reduced ? sliders.ringBend2 : sliders.ringBend3;
            rigValues[p + "PINKYSPLAY"] = reduced ? sliders.globalSplay : sliders.pinkySplay;
            rigValues[p + "PINKYBEND1"] = sliders.pinkyBend1;
            rigValues[p + "PINKYBEND2"] = sliders.pinkyBend2;
            rigValues[p + "PINKYBEND3"] = reduced ? sliders.pinkyBend2 : sliders.pinkyBend3;
            rigValues[p + "GLOBALSPLAY"] = sliders.globalSplay;
            rigValues[p + "INDEXTWIST"] = reduced ? 0 : sliders.indexTwist;
            rigValues[p + "MIDDLETWIST"] = reduced ? 0 : sliders.middleTwist;
            rigValues[p + "RINGTWIST"] = reduced ? 0 : sliders.ringTwist;
            rigValues[p + "PINKYTWIST"] = reduced ? 0 : sliders.pinkyTwist;

            return rigValues;
        }
    }
}
