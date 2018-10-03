precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D panorama;
uniform float u_width;
uniform float u_height;
uniform mat4 u_inverseView;
// provided by cesium: uniform mat4 czm_inverseProjection;
varying vec2 v_textureCoordinates;

void main(void)
{
    vec2 vertex = (gl_FragCoord.xy / vec2(u_width, u_height)) * 2.0 - 1.0;
    vec4 ray = u_inverseView * czm_inverseProjection * vec4(vertex.xy, 1.0, 1.0);

    // vec3 ray = vec3((gl_FragCoord.xy / vec2(u_width, u_height)) * 2.0 - 1.0, 1.0);

    // vec3 stu = normalize(ray.xyz) * vec3(-1.0, 1.0, -1.0);
    vec3 stu = normalize(ray.xyz) * vec3(-1.0, 1.0, -1.0);

    float z = 1.0 - stu.z;
    float m = sqrt(stu.x * stu.x + stu.y * stu.y + z * z);
    vec2 uv = 0.5 + 0.5 * vec2(+stu.x, -stu.y) / m;

    vec4 color = texture2D(colorTexture, v_textureCoordinates);
    vec4 pano = texture2D(panorama, uv);
    gl_FragColor = mix(color, pano, 0.8);
}
