/**
 * Shared fragment snippet for the round, soft-edged weapon glow sprites (bolt heads, laser and
 * lightning muzzle/tip glows, missile exhaust). Injected into a PointsMaterial in place of
 * `outgoingLight = diffuseColor.rgb;`.
 *
 * - Outer ring : fully transparent (circular clip)
 * - Mid falloff: weapon colour fading out (glow halo)
 * - Bright core: blends toward white for a hot-centre "plasma" look
 *
 * The colours, falloff and opacities were tuned by eye on the pre-HDR output, which showed the
 * computed value directly on screen. The scene is now linear light with an sRGB output encode,
 * so the finished colour and alpha are decoded (≈ power 2.2) to look exactly as tuned; stacked
 * glows can still exceed 1 and roll off in the tone curve instead of clipping.
 */
export const GLOW_SPRITE_FRAGMENT = /* glsl */ `outgoingLight = diffuseColor.rgb;
float _d  = length(gl_PointCoord - vec2(0.5));
if (_d > 0.5) discard;
float _r    = _d * 2.0;                              // 0 = centre, 1 = edge
float _glow = pow(1.0 - _r, 1.5);                   // smooth alpha falloff
outgoingLight = mix(outgoingLight, vec3(1.0),
                    pow(max(0.0, 1.0 - _r * 1.5), 2.5));
diffuseColor.a *= _glow;
// Display-tuned -> linear light.
outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(2.2));
diffuseColor.a = pow(clamp(diffuseColor.a, 0.0, 1.0), 2.2);`;
