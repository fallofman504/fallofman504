/**
 * Which settings Creality Print shows or hides depending on other settings. Ported by hand from
 * ConfigManipulation::toggle_print_fff_options (src/slic3r/GUI/ConfigManipulation.cpp) and
 * TabPrint::toggle_options (src/slic3r/GUI/Tab.cpp), v7.3.2, so the website
 * shows the same fields the slicer would. Where the slicer toggles a field more than once, its last rule wins,
 * and that is the one written here. Re-check this file when moving to a new slicer version.
 */

/** Facts about the printer that the slicer's rules depend on. The same for the K1 and K2 in v7.3.2. */
const MACHINE = {
  singleExtruderMultiMaterial: true, // "single_extruder_multi_material": "1"
  crealityPurgeTower: true, // creality::is_firmwaresoft_mm_printer_from_string
  linkedNoTowerOptions: false, // "prime_tower_toolchange_at_start" is not set
};

type Get = (key: string) => string;

const MULTILINE_PATTERNS = ["gyroid", "grid", "zig-zag", "tpmsd", "tpmsfk", "crosshatch", "honeycomb", "lateral-lattice", "lateral-honeycomb",
  "cubic", "tri-hexagon", "alignedrectilinear", "lightning", "3dhoneycomb", "adaptivecubic", "supportcubic"];
const ARACHNE_ONLY = ["wall_transition_length", "wall_transition_filter_deviation", "wall_transition_angle", "min_feature_size",
  "min_length_factor", "min_bead_width", "wall_distribution_count", "initial_layer_min_bead_width"];
const TREE_ONLY = ["tree_support_branch_angle", "tree_support_branch_distance", "tree_support_branch_diameter", "tree_support_branch_diameter_angle",
  "max_bridge_length", "support_base_pattern_tree", "tree_support_wall_count_tree", "tree_support_organic_validate_repair"];
const TOWER_ONLY = ["prime_tower_width", "prime_tower_brim_width", "prime_tower_skip_points", "prime_tower_rib_wall", "prime_tower_enable_framework",
  "wipe_tower_rotation_angle", "wipe_tower_max_purge_speed", "wipe_tower_extra_flow", "wipe_tower_no_sparse_layers", "wipe_tower_extra_spacing",
  "prime_tower_start_ironing", "prime_tower_start_offset", "prime_tower_enhance_type"];
const LOCKED_ZAG_ONLY = ["skin_infill_density", "infill_lock_depth", "skin_infill_depth", "skin_infill_line_width", "skeleton_infill_line_width",
  "locked_skin_infill_pattern", "locked_skeleton_infill_pattern"];
const SEAM_SLOPE_ONLY = ["seam_slope_conditional", "seam_slope_start_height", "seam_slope_entire_loop", "seam_slope_min_length", "seam_slope_steps",
  "seam_slope_inner_walls", "scarf_joint_speed"];
const OVERHANG_SPEED_ONLY = ["overhang_speed_classic", "overhang_1_4_speed", "overhang_2_4_speed", "overhang_3_4_speed", "overhang_4_4_speed", "overhang_totally_speed"];

/** True when the slicer would show this field given the current values. */
export function isShown(key: string, get: Get): boolean {
  const on = (k: string) => get(k) === "1";
  const num = (k: string) => parseFloat(get(k)) || 0;

  const pattern = get("sparse_infill_pattern");
  const gradualTpms = ["tpms_gradual_g", "tpms_gradual_d", "tpms_gradual_fk"].includes(pattern);
  const fieldInfill = pattern === "field";
  const haveInfill = num("sparse_infill_density") > 0 || gradualTpms || fieldInfill;
  const tower = on("enable_prime_tower");
  const spiral = on("spiral_mode");
  const supportType = get("support_type");
  const isTree = supportType.startsWith("tree");
  const haveRaft = num("raft_layers") > 0;
  const haveSupport = on("enable_support") || haveRaft;
  const supportIsTree = on("enable_support") && isTree;
  const arachne = get("wall_generator") === "arachne";
  const overhangSpeed = on("enable_overhang_speed");
  const overhangClassic = on("overhang_speed_classic");
  const seamSlope = !spiral && get("seam_slope_type") !== "none";
  const noise = get("fuzzy_skin_noise_type");
  const enhance = get("prime_tower_enhance_type");
  const haveSkirt = num("skirt_loops") > 0;
  const haveInterface = num("support_interface_top_layers") > 0 || num("support_interface_bottom_layers") > 0;

  if (ARACHNE_ONLY.includes(key)) return arachne;
  if (TREE_ONLY.includes(key)) return supportIsTree;
  if (TOWER_ONLY.includes(key)) return tower;
  if (LOCKED_ZAG_ONLY.includes(key)) return pattern === "locked-zag";
  if (SEAM_SLOPE_ONLY.includes(key)) return seamSlope;
  if (OVERHANG_SPEED_ONLY.includes(key)) return overhangSpeed;

  switch (key) {
    // Quality
    case "scarf_angle_threshold":
    case "scarf_overhang_threshold":
      return seamSlope && on("seam_slope_conditional");
    case "elefant_foot_compensation_layers":
      return num("elefant_foot_compensation") > 0;
    case "hole_to_polyhole_threshold":
    case "hole_to_polyhole_twisted":
      return on("hole_to_polyhole");
    case "zaa_wall_lowering_min_slope":
    case "zaa_slice_plane_offset":
    case "zaa_lock_top_surface_fill_direction":
      return on("zaa_enabled");
    case "ironing_pattern":
    case "ironing_speed":
    case "ironing_flow":
    case "ironing_spacing":
    case "ironing_angle":
      return get("ironing_type") !== "no ironing";
    case "min_width_top_surface":
      return on("only_one_wall_top") || (num("min_length_factor") > 0.5 && arachne);
    case "max_travel_detour_distance":
      return on("reduce_crossing_wall");
    case "make_overhang_printable_angle":
    case "make_overhang_printable_hole_size":
      return on("make_overhang_printable");
    case "overhang_reverse_threshold":
    case "overhang_reverse_internal_only":
      return on("detect_overhang_wall") && !spiral && get("wall_direction") === "auto" && on("overhang_reverse");

    // Strength (the first seven rules live in TabPrint::toggle_options in Tab.cpp)
    case "sparse_infill_density":
      return !gradualTpms && !fieldInfill;
    case "tpms_start_infill_density":
    case "tpms_end_infill_density":
    case "tpms_gradual_direction":
      return gradualTpms;
    case "interior_coefficient":
    case "surface_coefficient":
    case "cell_type":
      return fieldInfill;
    case "detect_thin_wall":
      return !arachne;
    case "sparse_infill_pattern":
    case "infill_combination":
    case "minimum_sparse_infill_area":
    case "infill_anchor_max":
      return haveInfill;
    case "fill_multiline":
      return !on("ai_infill") && MULTILINE_PATTERNS.includes(pattern);
    case "filter_out_gap_fill":
      return get("gap_fill_target") !== "nowhere";
    case "skeleton_infill_density":
      return pattern === "locked-zag" && tower;
    case "minimum_skeleton_infill_density":
      return pattern === "locked-zag" && !tower;
    case "skeleton_wipe_line_width":
      return false;
    case "infill_rotate_step":
      return pattern === "zig-zag2";
    case "symmetric_infill_y_axis":
      return ["zig-zag2", "cross-zag", "locked-zag"].includes(pattern);
    case "infill_shift_step":
      return pattern === "cross-zag";
    case "lateral_lattice_angle_1":
    case "lateral_lattice_angle_2":
      return pattern === "lateral-lattice";
    case "infill_overhang_angle":
      return pattern === "lateral-honeycomb";
    case "detect_floating_vertical_shell":
    case "vertical_shell_speed":
      return on("detect_narrow_internal_solid_infill");

    // Speed
    case "slowdown_for_curled_perimeters":
      return !overhangClassic && overhangSpeed;
    case "smooth_speed_discontinuity_area":
      return overhangClassic && overhangSpeed;
    case "smooth_coefficient":
      return on("smooth_speed_discontinuity_area") && overhangClassic && overhangSpeed;
    case "msao_safe_accel":
    case "msao_safe_velocity":
      return on("msao_recovery_enable");
    case "max_volumetric_extrusion_rate_slope_segment_length":
    case "extrusion_rate_smoothing_external_perimeter_only":
      return num("max_volumetric_extrusion_rate_slope") > 0;

    // Support
    case "support_critical_regions_only":
      return supportType.endsWith("(auto)") && supportIsTree;
    case "bridge_no_support":
      return !isTree;
    case "support_ironing_pattern":
    case "support_ironing_flow":
    case "support_ironing_spacing":
      return (haveRaft || (haveSupport && num("support_interface_top_layers") > 0)) && on("support_ironing");
    case "support_speed":
      return haveSupport || (haveSkirt && (num("skirt_height") > 1 || get("draft_shield") !== "enabled"));
    case "support_interface_speed":
      return haveSupport && haveInterface;
    case "minimum_support_area":
      return on("support_remove_small_overhang");
    case "tree_hybrid_cross_height":
      return supportIsTree && get("support_style") === "tree_hybrid";
    case "ironing_support_layer":
      return on("enable_support") && !isTree;
    case "raft_contact_distance":
      return haveRaft && !(haveSupport && num("support_top_z_distance") === 0);
    case "support_interface_not_for_body":
      return num("support_interface_filament") !== 0 && num("support_filament") === 0;

    // Multimaterial
    case "prime_tower_corner_rib_length":
      return tower && enhance === "corner_rib";
    case "wipe_tower_cone_angle":
      return tower && enhance === "cone";
    case "wipe_tower_bridging":
    case "single_extruder_multi_material_priming":
      return false;
    case "wipe_tower_extra_interlayer_wipe_layers":
      return tower && !on("wipe_tower_no_sparse_layers");
    case "wipe_tower_filament":
      return MACHINE.crealityPurgeTower;
    case "ooze_prevention":
    case "wait_for_temperature_after_toolchange":
      return !MACHINE.singleExtruderMultiMaterial && (key === "ooze_prevention" || on("ooze_prevention"));
    case "standby_temperature_delta":
    case "preheat_temperature_delta":
    case "preheat_time":
      return on("ooze_prevention");
    case "flush_into_infill":
    case "flush_into_support":
    case "flush_into_skeleton":
      return MACHINE.singleExtruderMultiMaterial;
    case "flush_into_objects":
      return false; // only offered per object in the slicer, never in the global settings
    case "flush_into_solid_skeleton":
      return !tower;
    case "bottom_fill_flush_layers":
    case "top_fill_flush_layers":
    case "skeleton_flush_slowdown_speed":
      return MACHINE.linkedNoTowerOptions && !tower;
    case "mmu_segmented_region_interlocking_depth":
      return !on("interlocking_beam");
    case "interlocking_beam_width":
    case "interlocking_orientation":
    case "interlocking_beam_layer_count":
    case "interlocking_depth":
    case "interlocking_boundary_avoidance":
      return on("interlocking_beam");

    // Others
    case "brim_ears_max_angle":
    case "brim_ears_detection_length":
      return get("brim_type") === "brim_ears";
    case "spiral_mode_smooth":
      return spiral;
    case "spiral_mode_max_xy_smoothing":
      return spiral && on("spiral_mode_smooth");
    case "fuzzy_skin_scale":
      return noise !== "classic";
    case "fuzzy_skin_octaves":
      return noise !== "classic" && noise !== "voronoi";
    case "fuzzy_skin_persistence":
      return noise === "perlin" || noise === "billow";
    default:
      return true;
  }
}

/** The "Style" dropdown under Support only offers the styles that fit the chosen support type. */
export function supportStyleChoices(supportType: string): string[] {
  return supportType.startsWith("tree") ? ["default", "tree_slim", "tree_strong", "tree_hybrid", "organic"] : ["default", "grid", "snug"];
}
