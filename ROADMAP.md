# CyberNetAttack - Feature & Enhancement Roadmap

## Phase 1: Special Weapon & Pickup System (Level Pickups)
- [x] **Pickup-Activated Special Weapons**: Replace the default EMP meter with an Active Tactical Item Slot. Special weapons drop from downed heavy machines or appear in supply crates; once depleted/used, players must scavenge a new item drop.
- [x] **Tactical Mini-Nuke (M-38 Davy Crockett / Tech-Com Warhead)**: A rare consumable pickup. When triggered, launches a low-yield nuclear charge down the center lane, emitting a blinding flash, destroying all ground forces, stripping boss plating by 80%, and leaving radioactive fallout trails.
- [x] **Throwable C4 Explosive Pack**: Consumable special item (3 charges). The lead squad member hurls C4 packs that stick to incoming heavy machinery/tanks and detonate manually or upon impact for massive concentrated structural damage.
- [x] **M-25 Phased-Plasma Heavy Cannon**: Single-use heavy shoulder weapon pickup for the squad leader that fires a piercing ultra-high-output 100kW purple plasma beam down an entire lane, destroying everything in its path.
- [x] **Magnetic Pulse Grenade Bundle**: Short-range 3-charge throwable item. Disables machine optics, turns off laser targeting arcs, and stuns all bipedal endoskeletons in a wide radius for 8 seconds.
- [x] **Infiltrator Reprogramming Spike**: A single-use melee hack dart pickup. Converts an incoming bipedal T-800 or T-600 into an auxiliary squad guard that walks point until destroyed.
- [x] **Resistance Signal Flare (Heavy Artillery Strike)**: Consumable radio flare item that paints a 30-meter radius on the road for a 105mm artillery barrage from hidden Tech-Com bunkers.

## Phase 2: Tactical Terrain & Environmental Obstacles
- [x] **Concrete Jersey Barriers**: Rigid concrete road dividers spawned in lanes. Squad movement is blocked or slowed when bumping into them, requiring players to weave around them or destroy them with heavy weapons.
- [x] **Rubble Berms & Rebar Webbing**: Choked ruins across lanes that slow squad speed by 40% and disable sprint until cleared or blown up with explosive ordnance.
- [x] **Collapsing Overpass Bridges**: Overhead structural ruins that drop heavy debris slabs across 2 of 3 lanes when shot or triggered by HK missile strikes.
- [x] **Electrified High-Voltage Power Lines**: Fallen grid cables dangling over the road that electrocute squad members and stun machines passing beneath them.
- [x] **Tank Traps / Czech Hedgehogs**: Heavy steel X-barriers that block heavy tracked units (HK-Tank, T-1, Ogre) but allow light infantry and bipedal endos to squeeze through.

## Phase 3: New Terminator Franchise Enemy Units
- [ ] **T-1000 Liquid Metal Prototype (Boss/Special Hunter)**: A deadly shape-shifting infiltrator that morphs between a runner blade stance and bullet-absorbing chrome form, immune to ballistics but vulnerable to plasma and mini-nukes.
- [ ] **T-700 Heavy Endo (Reinforced Grunt)**: Bulky precursor endoskeleton between T-600 and T-800 with extra torso armor plating and dual arm-mounted sub-machine guns.
- [ ] **HK-Centurion (Quad-Legged Heavy Walker)**: A massive 4-legged heavy walker boss equipped with dual gatling turrets and side-mounted mortar pods.
- [ ] **HK-Drone Scout (Swarm Flyers)**: Fast-flying micro-drones that attack in groups of 5, diving at squad members to detonate micro-charges.
- [ ] **Hunter-Killer Minelayer**: A tracked armored vehicle that drops active proximity plasma mines in the squad's steering path.
- [ ] **T-400 Maintenance Endo**: Weak, rusty maintenance droids spawned in industrial sectors that carry explosive fuel cells.

## Phase 4: Squad Classes & Tactical Synergies
- [ ] **Heavy Gunner / Grenadier Class**: Fires 40mm anti-armor grenade rounds that pop incoming Endoskeletons into crawlers.
- [ ] **Tech-Com Hacker Class**: Passively corrupts machine targeting systems, causing 15% of enemy plasma bolts to miss.
- [ ] **Field Medic / Combat Surgeon**: Drops automated nanite repair kits when squad health drops below 30%.
- [ ] **Resistance Sniper / Scout**: Equipped with thermal scopes to target structural weak points on bosses for 2.5x critical damage.
- [ ] **Demolitions Specialist**: Passively increases all splash damage and C4/Mini-Nuke blast radius by +35%.
- [ ] **Squad Formation Formations**: Add toggleable tactical formations (V-Shape, Tight Column, Wide Wall) to alter hitboxes and firing spreads on the fly.

## Phase 5: Gameplay & Quality-of-Life Enhancements
- [ ] **Dynamic Dismemberment System**: Blowing off Endoskeleton arms reduces their weapon output, while leg damage forces them into crawling stances.
- [ ] **Laser Target Designators**: Show visible red/cyan laser targeting lines from HK-Tanks and Sky Hunters 1.5 seconds before volleys are unleashed.
- [ ] **Boss Armor Component Destruction**: Bosses (HK-Tank, Harvester, Ogre) feature targetable subsystems (left turret, shoulder launcher, track pods) that can be destroyed individually.
- [ ] **Sector Environmental Hazards**: Burning plasma storms in Foundry sectors, night-vision dark zones in Metro sectors, and radioactive rain in Salt Flats.
- [ ] **Customizable Armory Loadout Presets**: Allow saving up to 3 custom squad class & weapon loadout setups for instant deployment.
- [ ] **Endless Resistance Survival Mode**: A wave-based endless mode with escalating Skynet assault waves and global leaderboards.
- [ ] **Interactive Audio Chatter**: Voice/radio barks from Resistance squad members ("T-800 incoming!", "Drop the C4!", "Clear the lane!").
- [ ] **Destructible Cover Objects**: Abandoned Resistance pickup trucks and sandbag bunkers that squad members can hide behind to soak incoming plasma bolts until the cover breaks.
- [ ] **Gate Sightline & Projectile Occlusion**: Squad bullets, heavy rockets, and enemy plasma bolts are blocked by active gates, preventing shooting across gate barriers; enemies positioned beyond a gate hold their fire until the squad passes through the gate.
- [ ] **Low-Health Boss Glitch & Degradation**: As bosses take heavy damage (below 50% and 25% HP), dynamically reduce their forward/weave speed and weapon fire rate while introducing erratic glitching/twitching steering and blue electrical arc FX (reusing EMP stun arc particles).

## Phase 6: Bug Fixes & Engine Optimizations
- [ ] **Gate Clashing Hitbox Overlap Fix**: Prevent simultaneous gate triggers when squad size spans wider than a single lane width.
- [ ] **Boss Health Scaling Cap**: Fix extreme HP scaling bugs on high sector levels where boss health outpaces maximum possible squad DPS output.
- [ ] **Audio Context Resume Deadlock**: Fix Web Audio Context suspension bug on mobile Safari when transitioning between level overlay menus and gameplay.
- [ ] **Particle Buffer Overflow Safeguard**: Optimize particle array recycling (`G.parts`) during multi-rocket explosions to eliminate frame drops on lower-spec GPUs.
- [ ] **High DPI Render Scaling Calibration**: Ensure `RS` canvas scaling retains 1:1 aspect ratio when switching between arcade CRT mode and standard crisp view on Retina displays.
- [ ] **Projected Z-Depth Sorting Fix**: Correct z-index sorting order when airborne HK-Aerial units overlap large bipedal Harvesters during boss sector transitions.
