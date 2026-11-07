Redesign the AddEditBodyPanel component
This component allows users to select a preset body, such as solar system bodies like sun, earth, jupiter, etc. And allows users to create custom procedural worlds and stars.

The problem:
The layout of the component is overwhelming and not very intuitive. Code is repeated with edit and add components.

The solution:
- Preset body's doesn't contain all of the bodies that are created initially in the main solar system. We need to add all of them that are missing.
Custom body layout:
- We need to create one section for both add and edit, and depending on the mode and what is editable, enable or disable certain fields instead of having two separate add/edit inputs.
- Reorganize the layout.
    - Adding New
        - When Custom is selected, show the Body Type dropdown with a < Select > item. No other fields will show yet.
        - When a user selects a body type, if the body type is Planet, show the Planet Type dropdown with < Select > initial item. If the Body Type is Moon, show the Moon Type dropdown with < Select > initial item. No other fields will show until the user selects Planet or Moon type. For all other bodies, show all the related fields for that body type.
        - Once the user selects Planet or Moon type, show the related fields for planets or moons.
        - Investigate how procedural generated objects work with this as we still want randomized initial values for the selected body type and planet/moon type (for example, currently, selecting Gas Giant randomizes the fields based on Gas Giant values. This should continue to work.)
    - Add or Edit
        - The fields should be organized into groups Name and all other fields will come below the Body Type and or the Planet Type and Moon Type dropdowns.
        - Organize the related fields into groups.
        - Randomize Button
        - Basic Info - Collapsable section, expanded by default
            - Name, Mass, Size, Has Rings
        - Orbital Elements -- collapsed (Section name shows name of parent). if no parent selected, assume parent is first star in the body list
            - Orbit Parent, Type, Inclination, Axial Tilt, Tilt Azimuth
        - Atmosphere -- collapsed
            - Atmosphere Radius, Surface Presure
        - Magnetic Field -- collapsed
            - Has Magnetic Field, Field Strength, Dipole Tilt, Dipole Azimuth, Dipole Offset, Reverse Polarity

Other enhancements
- If the selected body is destroyed while the edit panel is open. Close the edit panel
