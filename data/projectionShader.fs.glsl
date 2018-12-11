precision highp float;

// cesium
// uniform vec4 czm_viewport;
// uniform mat4 czm_inverseProjection;
// uniform mat4 czm_inverseView;
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;

varying vec2 v_textureCoordinates;

// custom uniforms
uniform sampler2D u_panorama;

uniform mat4 u_frontRotation;
uniform mat4 u_inverseCameraRotation;
uniform mat4 u_inverseCameraTransform;

uniform float u_interpolation;

// constants
const float PI = 3.14159265359;
const vec3 X_AXIS = vec3(1.0, 0.0, 0.0);
const vec3 Y_AXIS = vec3(0.0, 1.0, 0.0);
const vec3 Z_AXIS = vec3(0.0, 0.0, 1.0);

// compute a rotation matrix for the given axis and angle
mat4 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}

vec2 equirectangular(vec3 ray)
{
    // orig:
    // vec3 stu = normalize(ray.xyz) * vec3(-1.0, 1.0, 1.0);
    vec3 stu = normalize(ray.xyz);

    const float c_1Over2Pi = 0.1591549430918953357688837633725;
    const float c_1OverPi  = 0.3183098861837906715377675267450;

    float v = (acos(stu.y) * c_1OverPi);
    vec2 uv = vec2(atan(stu.x, stu.z) * c_1Over2Pi + 0.5, v);
    return uv;
}

// alternate panorama formats
// vec2 sphere(vec3 ray)
// {
//     vec3 stu = normalize(ray) * vec3(-1.0, 1.0, -1.0);
//
//     float z = 1.0 - stu.z;
//     float m = sqrt(stu.x * stu.x + stu.y * stu.y + z * z);
//     vec2 uv = 0.5 + 0.5 * vec2(+stu.x, -stu.y) / m;
//     return uv;
// }
//
// vec2 polar(vec3 ray)
// {
//     vec3 stu = normalize(ray) * vec3(-1.0, 1.0, 1.0);
//
//     stu.y = asin(stu.y) * 2.0 / 3.14159265359;
//     float m = stu.y > 0.0 ? 1.0 + stu.y : 1.0 - stu.y;
//     vec2 uv = 0.5 + 0.5 * vec2(stu.x, stu.z) / m;
//     return uv;
// }

// <debugging>
// int digit(float value, int dig) {
//   int x1 = int(abs(value) * pow(10.0, float(dig)));
//   int x2 = int(float(x1) / pow(10.0, float(dig - 1)));
//   return x1 - (x2 * 10);
// }
//
// vec4 visualizeDirection(vec3 ray)
// {
//   vec4 debug = vec4(0.8 * ray, 1.0);
//   if (digit(debug.x, 2) == 0) debug.x = 1.0;
//   if (digit(debug.y, 2) == 0) debug.y = 1.0;
//   if (digit(debug.z, 2) == 0) debug.z = 1.0;
//   return debug;
// }
// </debugging>

void main(void)
{
    // gl_FragCoord coordinates are in pixels (for x and y) --> transform to [0, 1]
    vec2 screenPos = (gl_FragCoord.xy / czm_viewport.zw) * 2.0 - 1.0;
    // we want the virtual sphere to be as far away as possible
    // --> on the far plane --> ndc.z = 1.0
    vec4 ndcPos = vec4(screenPos, 1.0, 1.0);
    vec4 clipPos = ndcPos / gl_FragCoord.w;
    vec4 eyePos = czm_inverseProjection * clipPos;
    vec4 worldPos = czm_inverseView * eyePos;

    // transform coordinates to camera reference frame
    vec4 modelPos = u_inverseCameraTransform * worldPos;

    // fix rotation issue where the bottom is in front
    modelPos = u_frontRotation * modelPos;

    // rotate by the inverse of the camera rotation
    modelPos = u_inverseCameraRotation * modelPos;

    vec3 ray = normalize(modelPos.xyz);

    // compute texture coordinates from ray
    vec2 uv = equirectangular(ray.xyz);
    vec4 pano = texture2D(u_panorama, uv);

    float depth = texture2D(depthTexture, v_textureCoordinates).x;
    vec4 color = texture2D(colorTexture, v_textureCoordinates);

    // interpolate between panorama and geometry based on depth and user defined value
    gl_FragColor = mix(color, pano, clamp(depth + u_interpolation, 0.0, 1.0));
}
