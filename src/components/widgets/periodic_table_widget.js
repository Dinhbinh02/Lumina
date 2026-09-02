/**
 * PeriodicTableWidget
 * Authentic 18-Column Interactive Periodic Table of Elements (IUPAC / ACS Standard)
 * Full 118 chemical elements grid with Lanthanides, Actinides, Category Colors, and Dynamic Element Inspector.
 */

const ELEMENTS_DATA = [
    // Period 1
    { number: 1, symbol: 'H', name: 'Hydrogen', mass: '1.008', category: 'nonmetal', period: 1, group: 1, phase: 'Gas', config: '1s¹', electro: '2.20', melt: '-259.1°C', boil: '-252.9°C' },
    { number: 2, symbol: 'He', name: 'Helium', mass: '4.0026', category: 'noble_gas', period: 1, group: 18, phase: 'Gas', config: '1s²', electro: 'N/A', melt: '-272.2°C', boil: '-268.9°C' },

    // Period 2
    { number: 3, symbol: 'Li', name: 'Lithium', mass: '6.94', category: 'alkali', period: 2, group: 1, phase: 'Solid', config: '[He] 2s¹', electro: '0.98', melt: '180.5°C', boil: '1342°C' },
    { number: 4, symbol: 'Be', name: 'Beryllium', mass: '9.0122', category: 'alkaline_earth', period: 2, group: 2, phase: 'Solid', config: '[He] 2s²', electro: '1.57', melt: '1287°C', boil: '2469°C' },
    { number: 5, symbol: 'B', name: 'Boron', mass: '10.81', category: 'metalloid', period: 2, group: 13, phase: 'Solid', config: '[He] 2s² 2p¹', electro: '2.04', melt: '2076°C', boil: '3927°C' },
    { number: 6, symbol: 'C', name: 'Carbon', mass: '12.011', category: 'nonmetal', period: 2, group: 14, phase: 'Solid', config: '[He] 2s² 2p²', electro: '2.55', melt: '3550°C', boil: '4827°C' },
    { number: 7, symbol: 'N', name: 'Nitrogen', mass: '14.007', category: 'nonmetal', period: 2, group: 15, phase: 'Gas', config: '[He] 2s² 2p³', electro: '3.04', melt: '-210.0°C', boil: '-195.8°C' },
    { number: 8, symbol: 'O', name: 'Oxygen', mass: '15.999', category: 'nonmetal', period: 2, group: 16, phase: 'Gas', config: '[He] 2s² 2p⁴', electro: '3.44', melt: '-218.8°C', boil: '-183.0°C' },
    { number: 9, symbol: 'F', name: 'Fluorine', mass: '18.998', category: 'halogen', period: 2, group: 17, phase: 'Gas', config: '[He] 2s² 2p⁵', electro: '3.98', melt: '-219.6°C', boil: '-188.1°C' },
    { number: 10, symbol: 'Ne', name: 'Neon', mass: '20.180', category: 'noble_gas', period: 2, group: 18, phase: 'Gas', config: '[He] 2s² 2p⁶', electro: 'N/A', melt: '-248.6°C', boil: '-246.1°C' },

    // Period 3
    { number: 11, symbol: 'Na', name: 'Sodium', mass: '22.990', category: 'alkali', period: 3, group: 1, phase: 'Solid', config: '[Ne] 3s¹', electro: '0.93', melt: '97.8°C', boil: '883°C' },
    { number: 12, symbol: 'Mg', name: 'Magnesium', mass: '24.305', category: 'alkaline_earth', period: 3, group: 2, phase: 'Solid', config: '[Ne] 3s²', electro: '1.31', melt: '650°C', boil: '1090°C' },
    { number: 13, symbol: 'Al', name: 'Aluminium', mass: '26.982', category: 'post_transition', period: 3, group: 13, phase: 'Solid', config: '[Ne] 3s² 3p¹', electro: '1.61', melt: '660.3°C', boil: '2470°C' },
    { number: 14, symbol: 'Si', name: 'Silicon', mass: '28.085', category: 'metalloid', period: 3, group: 14, phase: 'Solid', config: '[Ne] 3s² 3p²', electro: '1.90', melt: '1414°C', boil: '3265°C' },
    { number: 15, symbol: 'P', name: 'Phosphorus', mass: '30.974', category: 'nonmetal', period: 3, group: 15, phase: 'Solid', config: '[Ne] 3s² 3p³', electro: '2.19', melt: '44.2°C', boil: '280.5°C' },
    { number: 16, symbol: 'S', name: 'Sulfur', mass: '32.06', category: 'nonmetal', period: 3, group: 16, phase: 'Solid', config: '[Ne] 3s² 3p⁴', electro: '2.58', melt: '115.2°C', boil: '444.6°C' },
    { number: 17, symbol: 'Cl', name: 'Chlorine', mass: '35.45', category: 'halogen', period: 3, group: 17, phase: 'Gas', config: '[Ne] 3s² 3p⁵', electro: '3.16', melt: '-101.5°C', boil: '-34.0°C' },
    { number: 18, symbol: 'Ar', name: 'Argon', mass: '39.948', category: 'noble_gas', period: 3, group: 18, phase: 'Gas', config: '[Ne] 3s² 3p⁶', electro: 'N/A', melt: '-189.3°C', boil: '-185.8°C' },

    // Period 4
    { number: 19, symbol: 'K', name: 'Potassium', mass: '39.098', category: 'alkali', period: 4, group: 1, phase: 'Solid', config: '[Ar] 4s¹', electro: '0.82', melt: '63.5°C', boil: '759°C' },
    { number: 20, symbol: 'Ca', name: 'Calcium', mass: '40.078', category: 'alkaline_earth', period: 4, group: 2, phase: 'Solid', config: '[Ar] 4s²', electro: '1.00', melt: '842°C', boil: '1484°C' },
    { number: 21, symbol: 'Sc', name: 'Scandium', mass: '44.956', category: 'transition', period: 4, group: 3, phase: 'Solid', config: '[Ar] 3d¹ 4s²', electro: '1.36', melt: '1541°C', boil: '2836°C' },
    { number: 22, symbol: 'Ti', name: 'Titanium', mass: '47.867', category: 'transition', period: 4, group: 4, phase: 'Solid', config: '[Ar] 3d² 4s²', electro: '1.54', melt: '1668°C', boil: '3287°C' },
    { number: 23, symbol: 'V', name: 'Vanadium', mass: '50.942', category: 'transition', period: 4, group: 5, phase: 'Solid', config: '[Ar] 3d³ 4s²', electro: '1.63', melt: '1910°C', boil: '3407°C' },
    { number: 24, symbol: 'Cr', name: 'Chromium', mass: '51.996', category: 'transition', period: 4, group: 6, phase: 'Solid', config: '[Ar] 3d⁵ 4s¹', electro: '1.66', melt: '1907°C', boil: '2671°C' },
    { number: 25, symbol: 'Mn', name: 'Manganese', mass: '54.938', category: 'transition', period: 4, group: 7, phase: 'Solid', config: '[Ar] 3d⁵ 4s²', electro: '1.55', melt: '1246°C', boil: '2061°C' },
    { number: 26, symbol: 'Fe', name: 'Iron', mass: '55.845', category: 'transition', period: 4, group: 8, phase: 'Solid', config: '[Ar] 3d⁶ 4s²', electro: '1.83', melt: '1538°C', boil: '2862°C' },
    { number: 27, symbol: 'Co', name: 'Cobalt', mass: '58.933', category: 'transition', period: 4, group: 9, phase: 'Solid', config: '[Ar] 3d⁷ 4s²', electro: '1.88', melt: '1495°C', boil: '2927°C' },
    { number: 28, symbol: 'Ni', name: 'Nickel', mass: '58.693', category: 'transition', period: 4, group: 10, phase: 'Solid', config: '[Ar] 3d⁸ 4s²', electro: '1.91', melt: '1455°C', boil: '2913°C' },
    { number: 29, symbol: 'Cu', name: 'Copper', mass: '63.546', category: 'transition', period: 4, group: 11, phase: 'Solid', config: '[Ar] 3d¹⁰ 4s¹', electro: '1.90', melt: '1085°C', boil: '2562°C' },
    { number: 30, symbol: 'Zn', name: 'Zinc', mass: '65.38', category: 'transition', period: 4, group: 12, phase: 'Solid', config: '[Ar] 3d¹⁰ 4s²', electro: '1.65', melt: '419.5°C', boil: '907°C' },
    { number: 31, symbol: 'Ga', name: 'Gallium', mass: '69.723', category: 'post_transition', period: 4, group: 13, phase: 'Solid', config: '[Ar] 3d¹⁰ 4s² 4p¹', electro: '1.81', melt: '29.76°C', boil: '2400°C' },
    { number: 32, symbol: 'Ge', name: 'Germanium', mass: '72.630', category: 'metalloid', period: 4, group: 14, phase: 'Solid', config: '[Ar] 3d¹⁰ 4s² 4p²', electro: '2.01', melt: '938.3°C', boil: '2833°C' },
    { number: 33, symbol: 'As', name: 'Arsenic', mass: '74.922', category: 'metalloid', period: 4, group: 15, phase: 'Solid', config: '[Ar] 3d¹⁰ 4s² 4p³', electro: '2.18', melt: '817°C', boil: '614°C' },
    { number: 34, symbol: 'Se', name: 'Selenium', mass: '78.971', category: 'nonmetal', period: 4, group: 16, phase: 'Solid', config: '[Ar] 3d¹⁰ 4s² 4p⁴', electro: '2.55', melt: '221°C', boil: '685°C' },
    { number: 35, symbol: 'Br', name: 'Bromine', mass: '79.904', category: 'halogen', period: 4, group: 17, phase: 'Liquid', config: '[Ar] 3d¹⁰ 4s² 4p⁵', electro: '2.96', melt: '-7.2°C', boil: '58.8°C' },
    { number: 36, symbol: 'Kr', name: 'Krypton', mass: '83.798', category: 'noble_gas', period: 4, group: 18, phase: 'Gas', config: '[Ar] 3d¹⁰ 4s² 4p⁶', electro: '3.00', melt: '-157.4°C', boil: '-153.2°C' },

    // Period 5
    { number: 37, symbol: 'Rb', name: 'Rubidium', mass: '85.468', category: 'alkali', period: 5, group: 1, phase: 'Solid', config: '[Kr] 5s¹', electro: '0.82', melt: '39.3°C', boil: '688°C' },
    { number: 38, symbol: 'Sr', name: 'Strontium', mass: '87.62', category: 'alkaline_earth', period: 5, group: 2, phase: 'Solid', config: '[Kr] 5s²', electro: '0.95', melt: '777°C', boil: '1382°C' },
    { number: 39, symbol: 'Y', name: 'Yttrium', mass: '88.906', category: 'transition', period: 5, group: 3, phase: 'Solid', config: '[Kr] 4d¹ 5s²', electro: '1.22', melt: '1526°C', boil: '3345°C' },
    { number: 40, symbol: 'Zr', name: 'Zirconium', mass: '91.224', category: 'transition', period: 5, group: 4, phase: 'Solid', config: '[Kr] 4d² 5s²', electro: '1.33', melt: '1855°C', boil: '4409°C' },
    { number: 41, symbol: 'Nb', name: 'Niobium', mass: '92.906', category: 'transition', period: 5, group: 5, phase: 'Solid', config: '[Kr] 4d⁴ 5s¹', electro: '1.6', melt: '2477°C', boil: '4744°C' },
    { number: 42, symbol: 'Mo', name: 'Molybdenum', mass: '95.95', category: 'transition', period: 5, group: 6, phase: 'Solid', config: '[Kr] 4d⁵ 5s¹', electro: '2.16', melt: '2623°C', boil: '4639°C' },
    { number: 43, symbol: 'Tc', name: 'Technetium', mass: '[98]', category: 'transition', period: 5, group: 7, phase: 'Solid', config: '[Kr] 4d⁵ 5s²', electro: '1.9', melt: '2157°C', boil: '4265°C' },
    { number: 44, symbol: 'Ru', name: 'Ruthenium', mass: '101.07', category: 'transition', period: 5, group: 8, phase: 'Solid', config: '[Kr] 4d⁷ 5s¹', electro: '2.2', melt: '2334°C', boil: '4150°C' },
    { number: 45, symbol: 'Rh', name: 'Rhodium', mass: '102.91', category: 'transition', period: 5, group: 9, phase: 'Solid', config: '[Kr] 4d⁸ 5s¹', electro: '2.28', melt: '1964°C', boil: '3695°C' },
    { number: 46, symbol: 'Pd', name: 'Palladium', mass: '106.42', category: 'transition', period: 5, group: 10, phase: 'Solid', config: '[Kr] 4d¹⁰', electro: '2.20', melt: '1555°C', boil: '2963°C' },
    { number: 47, symbol: 'Ag', name: 'Silver', mass: '107.87', category: 'transition', period: 5, group: 11, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s¹', electro: '1.93', melt: '961.8°C', boil: '2162°C' },
    { number: 48, symbol: 'Cd', name: 'Cadmium', mass: '112.41', category: 'transition', period: 5, group: 12, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s²', electro: '1.69', melt: '321.1°C', boil: '767°C' },
    { number: 49, symbol: 'In', name: 'Indium', mass: '114.82', category: 'post_transition', period: 5, group: 13, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s² 5p¹', electro: '1.78', melt: '156.6°C', boil: '2072°C' },
    { number: 50, symbol: 'Sn', name: 'Tin', mass: '118.71', category: 'post_transition', period: 5, group: 14, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s² 5p²', electro: '1.96', melt: '231.9°C', boil: '2602°C' },
    { number: 51, symbol: 'Sb', name: 'Antimony', mass: '121.76', category: 'metalloid', period: 5, group: 15, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s² 5p³', electro: '2.05', melt: '630.6°C', boil: '1587°C' },
    { number: 52, symbol: 'Te', name: 'Tellurium', mass: '127.60', category: 'metalloid', period: 5, group: 16, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s² 5p⁴', electro: '2.1', melt: '449.5°C', boil: '988°C' },
    { number: 53, symbol: 'I', name: 'Iodine', mass: '126.90', category: 'halogen', period: 5, group: 17, phase: 'Solid', config: '[Kr] 4d¹⁰ 5s² 5p⁵', electro: '2.66', melt: '113.7°C', boil: '184.3°C' },
    { number: 54, symbol: 'Xe', name: 'Xenon', mass: '131.29', category: 'noble_gas', period: 5, group: 18, phase: 'Gas', config: '[Kr] 4d¹⁰ 5s² 5p⁶', electro: '2.6', melt: '-111.8°C', boil: '-108.1°C' },

    // Period 6
    { number: 55, symbol: 'Cs', name: 'Caesium', mass: '132.91', category: 'alkali', period: 6, group: 1, phase: 'Solid', config: '[Xe] 6s¹', electro: '0.79', melt: '28.5°C', boil: '671°C' },
    { number: 56, symbol: 'Ba', name: 'Barium', mass: '137.33', category: 'alkaline_earth', period: 6, group: 2, phase: 'Solid', config: '[Xe] 6s²', electro: '0.89', melt: '727°C', boil: '1897°C' },
    // Lanthanides (57-71)
    { number: 57, symbol: 'La', name: 'Lanthanum', mass: '138.91', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 5d¹ 6s²', electro: '1.10', melt: '920°C', boil: '3464°C', row: 9, col: 4 },
    { number: 58, symbol: 'Ce', name: 'Cerium', mass: '140.12', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹ 5d¹ 6s²', electro: '1.12', melt: '798°C', boil: '3443°C', row: 9, col: 5 },
    { number: 59, symbol: 'Pr', name: 'Praseodymium', mass: '140.91', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f³ 6s²', electro: '1.13', melt: '931°C', boil: '3520°C', row: 9, col: 6 },
    { number: 60, symbol: 'Nd', name: 'Neodymium', mass: '144.24', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f⁴ 6s²', electro: '1.14', melt: '1024°C', boil: '3074°C', row: 9, col: 7 },
    { number: 61, symbol: 'Pm', name: 'Promethium', mass: '[145]', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f⁵ 6s²', electro: '1.13', melt: '1042°C', boil: '3000°C', row: 9, col: 8 },
    { number: 62, symbol: 'Sm', name: 'Samarium', mass: '150.36', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f⁶ 6s²', electro: '1.17', melt: '1072°C', boil: '1803°C', row: 9, col: 9 },
    { number: 63, symbol: 'Eu', name: 'Europium', mass: '151.96', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f⁷ 6s²', electro: '1.20', melt: '822°C', boil: '1529°C', row: 9, col: 10 },
    { number: 64, symbol: 'Gd', name: 'Gadolinium', mass: '157.25', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f⁷ 5d¹ 6s²', electro: '1.20', melt: '1313°C', boil: '3273°C', row: 9, col: 11 },
    { number: 65, symbol: 'Tb', name: 'Terbium', mass: '158.93', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f⁹ 6s²', electro: '1.20', melt: '1356°C', boil: '3230°C', row: 9, col: 12 },
    { number: 66, symbol: 'Dy', name: 'Dysprosium', mass: '162.50', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹⁰ 6s²', electro: '1.22', melt: '1412°C', boil: '2567°C', row: 9, col: 13 },
    { number: 67, symbol: 'Ho', name: 'Holmium', mass: '164.93', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹¹ 6s²', electro: '1.23', melt: '1474°C', boil: '2700°C', row: 9, col: 14 },
    { number: 68, symbol: 'Er', name: 'Erbium', mass: '167.26', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹² 6s²', electro: '1.24', melt: '1529°C', boil: '2868°C', row: 9, col: 15 },
    { number: 69, symbol: 'Tm', name: 'Thulium', mass: '168.93', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹³ 6s²', electro: '1.25', melt: '1545°C', boil: '1950°C', row: 9, col: 16 },
    { number: 70, symbol: 'Yb', name: 'Ytterbium', mass: '173.05', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹⁴ 6s²', electro: '1.10', melt: '819°C', boil: '1196°C', row: 9, col: 17 },
    { number: 71, symbol: 'Lu', name: 'Lutetium', mass: '174.97', category: 'lanthanide', period: 6, group: 3, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹ 6s²', electro: '1.27', melt: '1663°C', boil: '3402°C', row: 9, col: 18 },
    // Rest of Period 6
    { number: 72, symbol: 'Hf', name: 'Hafnium', mass: '178.49', category: 'transition', period: 6, group: 4, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d² 6s²', electro: '1.3', melt: '2233°C', boil: '4603°C' },
    { number: 73, symbol: 'Ta', name: 'Tantalum', mass: '180.95', category: 'transition', period: 6, group: 5, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d³ 6s²', electro: '1.5', melt: '3017°C', boil: '5458°C' },
    { number: 74, symbol: 'W', name: 'Tungsten', mass: '183.84', category: 'transition', period: 6, group: 6, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d⁴ 6s²', electro: '2.36', melt: '3422°C', boil: '5555°C' },
    { number: 75, symbol: 'Re', name: 'Rhenium', mass: '186.21', category: 'transition', period: 6, group: 7, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d⁵ 6s²', electro: '1.9', melt: '3186°C', boil: '5596°C' },
    { number: 76, symbol: 'Os', name: 'Osmium', mass: '190.23', category: 'transition', period: 6, group: 8, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d⁶ 6s²', electro: '2.2', melt: '3033°C', boil: '5012°C' },
    { number: 77, symbol: 'Ir', name: 'Iridium', mass: '192.22', category: 'transition', period: 6, group: 9, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d⁷ 6s²', electro: '2.20', melt: '2446°C', boil: '4428°C' },
    { number: 78, symbol: 'Pt', name: 'Platinum', mass: '195.08', category: 'transition', period: 6, group: 10, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d⁹ 6s¹', electro: '2.28', melt: '1768°C', boil: '3825°C' },
    { number: 79, symbol: 'Au', name: 'Gold', mass: '196.97', category: 'transition', period: 6, group: 11, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s¹', electro: '2.54', melt: '1064°C', boil: '2970°C' },
    { number: 80, symbol: 'Hg', name: 'Mercury', mass: '200.59', category: 'transition', period: 6, group: 12, phase: 'Liquid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s²', electro: '2.00', melt: '-38.8°C', boil: '356.7°C' },
    { number: 81, symbol: 'Tl', name: 'Thallium', mass: '204.38', category: 'post_transition', period: 6, group: 13, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹', electro: '1.62', melt: '304°C', boil: '1473°C' },
    { number: 82, symbol: 'Pb', name: 'Lead', mass: '207.2', category: 'post_transition', period: 6, group: 14, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²', electro: '2.33', melt: '327.5°C', boil: '1749°C' },
    { number: 83, symbol: 'Bi', name: 'Bismuth', mass: '208.98', category: 'post_transition', period: 6, group: 15, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³', electro: '2.02', melt: '271.4°C', boil: '1564°C' },
    { number: 84, symbol: 'Po', name: 'Polonium', mass: '[209]', category: 'post_transition', period: 6, group: 16, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴', electro: '2.0', melt: '254°C', boil: '962°C' },
    { number: 85, symbol: 'At', name: 'Astatine', mass: '[210]', category: 'halogen', period: 6, group: 17, phase: 'Solid', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵', electro: '2.2', melt: '302°C', boil: '337°C' },
    { number: 86, symbol: 'Rn', name: 'Radon', mass: '[222]', category: 'noble_gas', period: 6, group: 18, phase: 'Gas', config: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶', electro: '2.2', melt: '-71°C', boil: '-61.7°C' },

    // Period 7
    { number: 87, symbol: 'Fr', name: 'Francium', mass: '[223]', category: 'alkali', period: 7, group: 1, phase: 'Solid', config: '[Rn] 7s¹', electro: '0.7', melt: '27°C', boil: '677°C' },
    { number: 88, symbol: 'Ra', name: 'Radium', mass: '[226]', category: 'alkaline_earth', period: 7, group: 2, phase: 'Solid', config: '[Rn] 7s²', electro: '0.9', melt: '700°C', boil: '1737°C' },
    // Actinides (89-103)
    { number: 89, symbol: 'Ac', name: 'Actinium', mass: '[227]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 6d¹ 7s²', electro: '1.1', melt: '1050°C', boil: '3198°C', row: 10, col: 4 },
    { number: 90, symbol: 'Th', name: 'Thorium', mass: '232.04', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 6d² 7s²', electro: '1.3', melt: '1750°C', boil: '4788°C', row: 10, col: 5 },
    { number: 91, symbol: 'Pa', name: 'Protactinium', mass: '231.04', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f² 6d¹ 7s²', electro: '1.5', melt: '1568°C', boil: '4027°C', row: 10, col: 6 },
    { number: 92, symbol: 'U', name: 'Uranium', mass: '238.03', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f³ 6d¹ 7s²', electro: '1.38', melt: '1132°C', boil: '4131°C', row: 10, col: 7 },
    { number: 93, symbol: 'Np', name: 'Neptunium', mass: '[237]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f⁴ 6d¹ 7s²', electro: '1.36', melt: '644°C', boil: '3902°C', row: 10, col: 8 },
    { number: 94, symbol: 'Pu', name: 'Plutonium', mass: '[244]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f⁶ 7s²', electro: '1.28', melt: '640°C', boil: '3228°C', row: 10, col: 9 },
    { number: 95, symbol: 'Am', name: 'Americium', mass: '[243]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f⁷ 7s²', electro: '1.3', melt: '1176°C', boil: '2607°C', row: 10, col: 10 },
    { number: 96, symbol: 'Cm', name: 'Curium', mass: '[247]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f⁷ 6d¹ 7s²', electro: '1.3', melt: '1345°C', boil: '3110°C', row: 10, col: 11 },
    { number: 97, symbol: 'Bk', name: 'Berkelium', mass: '[247]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f⁹ 7s²', electro: '1.3', melt: '986°C', boil: '2627°C', row: 10, col: 12 },
    { number: 98, symbol: 'Cf', name: 'Californium', mass: '[251]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f¹⁰ 7s²', electro: '1.3', melt: '900°C', boil: '1470°C', row: 10, col: 13 },
    { number: 99, symbol: 'Es', name: 'Einsteinium', mass: '[252]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f¹¹ 7s²', electro: '1.3', melt: '860°C', boil: 'N/A', row: 10, col: 14 },
    { number: 100, symbol: 'Fm', name: 'Fermium', mass: '[257]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f¹² 7s²', electro: '1.3', melt: '1527°C', boil: 'N/A', row: 10, col: 15 },
    { number: 101, symbol: 'Md', name: 'Mendelevium', mass: '[258]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f¹³ 7s²', electro: '1.3', melt: '827°C', boil: 'N/A', row: 10, col: 16 },
    { number: 102, symbol: 'No', name: 'Nobelium', mass: '[259]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f¹⁴ 7s²', electro: '1.3', melt: '827°C', boil: 'N/A', row: 10, col: 17 },
    { number: 103, symbol: 'Lr', name: 'Lawrencium', mass: '[266]', category: 'actinide', period: 7, group: 3, phase: 'Solid', config: '[Rn] 5f¹⁴ 7s² 7p¹', electro: '1.3', melt: '1627°C', boil: 'N/A', row: 10, col: 18 },
    // Rest of Period 7 (Superheavy)
    { number: 104, symbol: 'Rf', name: 'Rutherfordium', mass: '[267]', category: 'transition', period: 7, group: 4, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d² 7s²', electro: 'N/A', melt: '2100°C', boil: '5500°C' },
    { number: 105, symbol: 'Db', name: 'Dubnium', mass: '[268]', category: 'transition', period: 7, group: 5, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d³ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 106, symbol: 'Sg', name: 'Seaborgium', mass: '[269]', category: 'transition', period: 7, group: 6, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d⁴ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 107, symbol: 'Bh', name: 'Bohrium', mass: '[270]', category: 'transition', period: 7, group: 7, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d⁵ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 108, symbol: 'Hs', name: 'Hassium', mass: '[277]', category: 'transition', period: 7, group: 8, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d⁶ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 109, symbol: 'Mt', name: 'Meitnerium', mass: '[278]', category: 'transition', period: 7, group: 9, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d⁷ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 110, symbol: 'Ds', name: 'Darmstadtium', mass: '[281]', category: 'transition', period: 7, group: 10, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d⁸ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 111, symbol: 'Rg', name: 'Roentgenium', mass: '[282]', category: 'transition', period: 7, group: 11, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d⁹ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 112, symbol: 'Cn', name: 'Copernicium', mass: '[285]', category: 'transition', period: 7, group: 12, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s²', electro: 'N/A', melt: 'N/A', boil: 'N/A' },
    { number: 113, symbol: 'Nh', name: 'Nihonium', mass: '[286]', category: 'post_transition', period: 7, group: 13, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹', electro: 'N/A', melt: '430°C', boil: '1130°C' },
    { number: 114, symbol: 'Fl', name: 'Flerovium', mass: '[289]', category: 'post_transition', period: 7, group: 14, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²', electro: 'N/A', melt: '-73°C', boil: '107°C' },
    { number: 115, symbol: 'Mc', name: 'Moscovium', mass: '[290]', category: 'post_transition', period: 7, group: 15, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³', electro: 'N/A', melt: '400°C', boil: '1100°C' },
    { number: 116, symbol: 'Lv', name: 'Livermorium', mass: '[293]', category: 'post_transition', period: 7, group: 16, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴', electro: 'N/A', melt: '435°C', boil: '812°C' },
    { number: 117, symbol: 'Ts', name: 'Tennessine', mass: '[294]', category: 'halogen', period: 7, group: 17, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵', electro: 'N/A', melt: '450°C', boil: '610°C' },
    { number: 118, symbol: 'Og', name: 'Oganesson', mass: '[294]', category: 'noble_gas', period: 7, group: 18, phase: 'Synthetic', config: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶', electro: 'N/A', melt: '52°C', boil: '177°C' }
];

const CATEGORY_META = {
    alkali: { name: 'Alkali Metal', color: '#eab308' },
    alkaline_earth: { name: 'Alkaline Earth', color: '#f97316' },
    transition: { name: 'Transition Metal', color: '#0284c7' },
    post_transition: { name: 'Post-transition Metal', color: '#64748b' },
    metalloid: { name: 'Metalloid', color: '#0d9488' },
    nonmetal: { name: 'Reactive Nonmetal', color: '#e11d48' },
    halogen: { name: 'Halogen', color: '#06b6d4' },
    noble_gas: { name: 'Noble Gas', color: '#8b5cf6' },
    lanthanide: { name: 'Lanthanide', color: '#f43f5e' },
    actinide: { name: 'Actinide', color: '#10b981' }
};

export class PeriodicTableWidget {
    constructor(container, props = {}) {
        this.container = container;
        this.props = props;
        this.selectedSymbol = props.element || props.symbol || props.query || 'Au';
        this.currentElement = null;

        this.init();
    }

    init() {
        this._findInitialElement();
        this._renderBase();
    }

    _findInitialElement() {
        const q = String(this.selectedSymbol).trim().toLowerCase();
        let el = ELEMENTS_DATA.find(e => 
            e.symbol.toLowerCase() === q || 
            e.name.toLowerCase() === q || 
            String(e.number) === q
        );
        if (!el) el = ELEMENTS_DATA.find(e => e.symbol === 'Au') || ELEMENTS_DATA[0];
        this.currentElement = el;
    }

    _renderBase() {
        const el = this.currentElement;
        const meta = CATEGORY_META[el.category] || { name: el.category, color: '#f59e0b' };

        this.container.innerHTML = `
            <div class="nexus-sol-periodic-card">
                <div class="nexus-periodic-top-bar">
                    <div class="nexus-periodic-title-row">
                        <span class="nexus-periodic-badge">⚛</span>
                        <span class="nexus-periodic-heading">Periodic Table of Elements</span>
                    </div>
                </div>

                <!-- Direct Element Inspector (No nested container boxes) -->
                <div class="nexus-pt-inspector">
                    <div class="nexus-pt-hero-left">
                        <div class="nexus-pt-hero-top">
                            <span class="nexus-pt-hero-z">${el.number}</span>
                            <span class="nexus-pt-hero-mass">${el.mass} u</span>
                        </div>
                        <span class="nexus-pt-hero-symbol" style="color: ${meta.color};">${el.symbol}</span>
                        <span class="nexus-pt-hero-name">${this._escapeHtml(el.name)}</span>
                    </div>
                    <div class="nexus-pt-hero-specs">
                        <div class="nexus-pt-spec-item">
                            <span class="nexus-pt-spec-label">Category</span>
                            <span class="nexus-pt-spec-val" style="color: ${meta.color}; font-weight: 600;">${this._escapeHtml(meta.name)}</span>
                        </div>
                        <div class="nexus-pt-spec-item">
                            <span class="nexus-pt-spec-label">Electron Config</span>
                            <span class="nexus-pt-spec-val">${this._formatElectronConfig(el.config)}</span>
                        </div>
                        <div class="nexus-pt-spec-item">
                            <span class="nexus-pt-spec-label">Electronegativity</span>
                            <span class="nexus-pt-spec-val">${el.electro}</span>
                        </div>
                        <div class="nexus-pt-spec-item">
                            <span class="nexus-pt-spec-label">Phase at STP</span>
                            <span class="nexus-pt-spec-val">${el.phase} (P${el.period}, G${el.group})</span>
                        </div>
                        <div class="nexus-pt-spec-item">
                            <span class="nexus-pt-spec-label">Melt / Boil</span>
                            <span class="nexus-pt-spec-val">${el.melt} / ${el.boil}</span>
                        </div>
                    </div>
                </div>

                <!-- Authentic 18-Column Periodic Table Grid (Direct on container) -->
                <div class="nexus-pt-grid-wrapper">
                    <div class="nexus-pt-18-grid">
                        ${this._render18Grid(el.symbol)}
                    </div>
                </div>

                <!-- Category Color Legend -->
                <div class="nexus-pt-legend-bar">
                    ${Object.entries(CATEGORY_META).map(([k, v]) => `
                        <div class="nexus-pt-legend-item">
                            <span class="nexus-pt-legend-dot" style="background: ${v.color};"></span>
                            <span class="nexus-pt-legend-text">${v.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this._attachEvents();
    }

    _render18Grid(activeSymbol) {
        let html = '';

        // Elements tiles placed by CSS Grid row and column
        ELEMENTS_DATA.forEach(item => {
            let row = item.row || item.period;
            let col = item.col || item.group;

            const isActive = item.symbol === activeSymbol ? 'is-active' : '';
            const style = `grid-row: ${row}; grid-column: ${col};`;

            html += `
                <button class="nexus-pt-tile is-cat-${item.category} ${isActive}" 
                        style="${style}" 
                        data-symbol="${item.symbol}" 
                        title="${item.name} (${item.symbol}) - Z: ${item.number}">
                    <span class="nexus-pt-tile-z">${item.number}</span>
                    <span class="nexus-pt-tile-sym">${item.symbol}</span>
                </button>
            `;
        });

        // Placeholders for Lanthanides & Actinides series in main table (Row 6 Col 3, Row 7 Col 3)
        html += `
            <div class="nexus-pt-placeholder-tile is-cat-lanthanide" style="grid-row: 6; grid-column: 3;" title="Lanthanides 57-71">
                <span class="nexus-pt-tile-z">57-71</span>
                <span class="nexus-pt-tile-sym">La-Lu</span>
            </div>
            <div class="nexus-pt-placeholder-tile is-cat-actinide" style="grid-row: 7; grid-column: 3;" title="Actinides 89-103">
                <span class="nexus-pt-tile-z">89-103</span>
                <span class="nexus-pt-tile-sym">Ac-Lr</span>
            </div>
        `;

        return html;
    }

    _attachEvents() {
        const tiles = this.container.querySelectorAll('.nexus-pt-tile');
        if (tiles) {
            tiles.forEach(tile => {
                tile.addEventListener('click', () => {
                    const sym = tile.dataset.symbol;
                    const match = ELEMENTS_DATA.find(item => item.symbol === sym);
                    if (match) {
                        this.currentElement = match;
                        this._renderBase();
                    }
                });
            });
        }
    }

    _formatElectronConfig(configStr) {
        if (!configStr) return '';
        const superMap = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
        // Convert unicode superscripts to standard digits wrapped in <sup>
        return this._escapeHtml(configStr).replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (match) => {
            const digits = match.split('').map(ch => superMap[ch] || ch).join('');
            return `<sup>${digits}</sup>`;
        });
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
