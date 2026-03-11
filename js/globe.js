// ===================================================================
// ROTATING GLOBE - Three.js Particle Globe (Reflect.app style)
// ===================================================================
(function initGlobe() {
  const canvas = document.getElementById('globe-canvas');
  if (!canvas) return;

  // Load Three.js dynamically
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  script.onload = createGlobe;
  document.head.appendChild(script);

  function createGlobe() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // Globe parameters
    const globeRadius = 100;
    const particleCount = 2500;
    const particleSize = 1.5;
    const particleColor = 0xfbbf24; // Yellow/gold matching the ROIs Crew theme
    const particleOpacity = 0.8;

    // Create particle geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    // Generate random points on sphere surface
    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / particleCount);
      const theta = Math.sqrt(particleCount * Math.PI) * phi;

      const x = globeRadius * Math.cos(theta) * Math.sin(phi);
      const y = globeRadius * Math.sin(theta) * Math.sin(phi);
      const z = globeRadius * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      originalPositions[i * 3] = x;
      originalPositions[i * 3 + 1] = y;
      originalPositions[i * 3 + 2] = z;

      // Vary particle sizes for depth effect
      sizes[i] = Math.random() * particleSize + 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Create particle material
    const material = new THREE.PointsMaterial({
      color: particleColor,
      size: particleSize,
      transparent: true,
      opacity: particleOpacity,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    // Create particle system
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Add connecting lines (wireframe effect)
    const lineGeometry = new THREE.IcosahedronGeometry(globeRadius * 0.98, 2);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: particleColor,
      transparent: true,
      opacity: 0.1,
      wireframe: true
    });
    const wireframe = new THREE.Mesh(lineGeometry, lineMaterial);
    scene.add(wireframe);

    // Add inner glow sphere
    const glowGeometry = new THREE.SphereGeometry(globeRadius * 0.85, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: particleColor,
      transparent: true,
      opacity: 0.03
    });
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(glowSphere);

    // Add outer ring
    const ringGeometry = new THREE.RingGeometry(globeRadius * 1.3, globeRadius * 1.32, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: particleColor,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Position camera
    camera.position.z = 350;
    camera.position.y = 80;
    camera.lookAt(0, 0, 0);

    // Animation variables
    let rotationSpeed = 0.001;
    let time = 0;

    // Mouse interaction
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      time += 0.01;

      // Rotate particles
      particles.rotation.y += rotationSpeed;
      wireframe.rotation.y += rotationSpeed;
      wireframe.rotation.x += rotationSpeed * 0.3;
      glowSphere.rotation.y += rotationSpeed * 0.5;

      // Rotate ring
      ring.rotation.z += rotationSpeed * 0.5;

      // Subtle mouse follow
      targetRotationX = mouseY * 0.1;
      targetRotationY = mouseX * 0.1;
      particles.rotation.x += (targetRotationX - particles.rotation.x) * 0.02;
      particles.rotation.y += (targetRotationY - particles.rotation.y) * 0.02;

      // Pulse effect on particles
      const positions = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const pulse = Math.sin(time + i * 0.1) * 0.5 + 0.5;
        const scale = 1 + pulse * 0.02;

        positions[i3] = originalPositions[i3] * scale;
        positions[i3 + 1] = originalPositions[i3 + 1] * scale;
        positions[i3 + 2] = originalPositions[i3 + 2] * scale;
      }
      particles.geometry.attributes.position.needsUpdate = true;

      // Animate wireframe opacity
      wireframe.material.opacity = 0.08 + Math.sin(time * 2) * 0.03;

      renderer.render(scene, camera);
    }

    animate();

    // Handle resize
    window.addEventListener('resize', () => {
      camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    });
  }
})();
