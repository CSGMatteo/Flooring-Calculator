import React, { useState } from "react";
import ScannerModal from "../ScannerModal";
import { REMOVAL_COSTS } from "../Data/removalCosts";
import { FLOORING } from "../Data/InstallCosts";
import App from "../../App";
import { MATERIAL_RULES } from "../Data/ExtraMaterials";

export default function VinylSheetRoom({ quote, setQuote, setMode, setPage }) {
    const WASTE_FACTOR = 1.05
    
    const {
        rooms,
        boxsqft,
        numberOfBoxes,
        roomCost,
        roomInstall,
        setRoomRemoval,
        roomTotal,
        globalRemovalType,
        extras,
        totals,
        material,
    } = quote;

    const [step, setStep] = useState("roomsInput");

    const [roomInput, setRoomInput] = useState({ width: "", length: "", removalType: ""});

    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannedItem, setScannedItem] = useState(null);
    
    const [selectedFloor, setSelectedFloor] = useState("vinylGlue")
    // Room Logic

    function addRoom(room) {
        if (!room.width || !room.length) return;

        const perimeter = getRoomPerimeter(room);

        const newRoom = {
            ...room,
            removalType: "",
            perimeter: perimeter
        };

        setQuote(prev => ({
            ...prev,
            rooms: [...prev.rooms, newRoom]
        }));
    }

    function getRoomPerimeter(room) {
        const width = room.width || 0;
        const length = room.length || 0;

        return 2 * (width + length);
    }

    function getTotalPerimeter() {
        return rooms.reduce((total,room) => {
            return total + getRoomPerimeter(room);
        }, 0);
    }

    function getRoomsArea() {
        return WASTE_FACTOR * rooms.reduce((total, room) => {
            return total + (room.width * room.length);
        }, 0);
    }


    function splitRoomsIntoPieces(rooms, rollWidth = 12){
        const pieces = [];

        rooms.forEach((room, index) => {

            let remainingWidth = room.width;
            let pieceNumber = 1;

            while (remainingWidth > rollWidth) {

                pieces.push({
                    room: index + 1,
                    piece: pieceNumber++,
                    rollWidth: rollWidth,
                    cutLength: room.length
                });

                remainingWidth -= rollWidth;
            }

            pieces.push({
                room: index + 1,
                piece: pieceNumber,
                rollWidth: remainingWidth,
                cutLength: room.length
            });
        });

        return pieces;
    }

    function sortPieces(pieces) {

        return [...pieces].sort((a, b) => {

            // Sort by cut length (largest first)
            if (b.cutLength !== a.cutLength) {
                return b.cutLength - a.cutLength;
            }

            // If cut lengths are equal, sort by roll width (largest first)
            return b.rollWidth - a.rollWidth;

        });
    }

    function separatePieces(pieces, rollWidth = 12) {

        const fullWidthPieces = [];
        const partialPieces = [];

        pieces.forEach(piece => {

            if (piece.rollWidth === rollWidth) {
                fullWidthPieces.push(piece);
            } else {
                partialPieces.push(piece);
            }

        });

        return {
            fullWidthPieces,
            partialPieces
        };
    }

    function buildStrips(pieces, rollWidth = 12){

        const strips = [];

        pieces.forEach(piece => {

            // Try to find a strip this piece fits into

            let strip = strips.find(strip =>
                strip.cutLength === piece.cutLength &&
                strip.remainingWidth >= piece.rollWidth
            );

            // None found? Create one.

            if (!strip) {

                strip = {
                    cutLength: piece.cutLength,
                    remainingWidth: rollWidth,
                    pieces: []
                };

                strips.push(strip);

            }

            strip.pieces.push(piece);
            strip.remainingWidth -= piece.rollWidth;

        });

        return strips;
    }

    function optimizeStrips(pieces, rollWidth = 12) {

        // Copy pieces and add a "used" flag
        const workingPieces = pieces.map(piece => ({
            ...piece,
            used: false
        }));

        const strips = [];

        // Keep building strips until every piece has been used
        while (hasUnusedPieces(workingPieces)) {

            const strip = {
                stripLength: 0,
                remainingWidth: rollWidth,
                pieces: []
            };
            
            // Get the largest unused piece
            const firstPiece = findFirstUnusedPiece(workingPieces);

            placePiece(strip, firstPiece)

            // Try to fill the strip
            while (true) {

                const nextPiece = findBestPiece(strip, workingPieces);

                if (!nextPiece)
                    break;

                placePiece(strip, nextPiece);
            }

            strips.push(strip);
        }

        return strips;
    }

    function hasUnusedPieces(pieces) {

        return pieces.some(piece => !piece.used);

    }

    function findFirstUnusedPiece(pieces) {

        return pieces.find(piece => !piece.used);

    }

    function placePiece(strip, piece) {

        strip.pieces.push(piece);

        piece.used = true;

        strip.remainingWidth -= piece.rollWidth;

        if (piece.cutLength > strip.stripLength) {
            strip.stripLength = piece.cutLength;
        }

    }

    function findBestPiece(strip, pieces) {

        for (const piece of pieces) {

            if (piece.used)
                continue;

            if (piece.rollWidth > strip.remainingWidth)
                continue;

            if (piece.cutLength > strip.stripLength)
                continue;

            return piece;
        }

        return null;

    }

    function calculateProduct(fullWidthPieces, strips, rollWidth = 12) {

        let totalLength = 0;
        const cuts = [];

        fullWidthPieces.forEach(piece => {
            totalLength += piece.cutLength;

            cuts.push({
                cutLength: piece.cutLength,
                rollWidth: rollWidth,
                pieces: [piece]
            });

        });

        strips.forEach(strip => {
            totalLength += strip.stripLength;

            cuts.push({
                cutLength: strip.stripLength,
                rollWidth: rollWidth,
                pieces: [strip.pieces]
            });

        });

        return {
            totalLength,
            totalSqft: totalLength * rollWidth,
            strips,
            fullWidthPieces,
            cuts
        };
    }

    function getProductData() {

        const pieces = splitRoomsIntoPieces(quote.rooms);

        const {
            fullWidthPieces,
            partialPieces
        } = separatePieces(pieces);

        const sortedPieces = sortPieces(partialPieces);

        const optimizedStrips = optimizeStrips(sortedPieces);

        return calculateProduct(fullWidthPieces, optimizedStrips);
    }

    function calculateRoomTotal() {

        const product = getProductData();

        const totalArea = product.totalSqft;
        
        const productCost = totalArea * roomCost;
        const removalCost = calculateRemovalCost();
        const installCost = calculateInstallCost();
        const materialCost = calculateMaterialCosts();

        const total = (productCost + removalCost + installCost + materialCost) * 1.13;

        console.log("Product Cost:", productCost)
        console.log("Removal Cost:", removalCost)
        console.log("Install Cost:", installCost)
        console.log("Material Cost:", materialCost)
        setQuote(prev => ({
            ...prev,
            material,
            roomTotal: (total)
        }));
        setStep("roomResult")
    }

    function calculateInstallCost() {
        if (!roomInstall) return 0;

        const product = getProductData();

        const totalArea = product.totalSqft;

        let rate = 0;
        let min = 0;
        
        const floor = FLOORING[selectedFloor];

        if (!floor) return 0;

        min = floor.minInstall || 0;

        rate = floor.installRate || 0;

        let total = totalArea * rate;

        if (total < min) {
            total = min;
        }

        return total;
    }

    function calculateUnitsNeeded(area, coverage, cost) {
        const units = Math.ceil(area / coverage);
        return units * cost;
    }

    function calculateMaterialCosts() {
        const product = getProductData();

        const totalArea = product.totalSqft;

        const materials = MATERIAL_RULES[selectedFloor] || [];

        let total = 0;

        const state = {};

        materials.forEach(mat => {
            if (mat.condition && !!mat.condition(state)) return;

            total += calculateUnitsNeeded(
                totalArea,
                mat.coverage,
                mat.cost
            );
        });

        return total;
    }

    function calculateRemovalCost() {
        // Keep track of the total area for each removal type
        const groupedAreas = {};

        rooms.forEach(room => {
            const type = globalRemovalType || room.removalType;

            if (!type) return;

            const area = 
                (parseFloat(room.width) || 0) *
                (parseFloat(room.length) || 0);
            
            groupedAreas[type] = (groupedAreas[type] || 0) + area;
        });

        let totalRemoval = 0;

        Object.entries(groupedAreas).forEach(([type, area]) => {
            const removal = REMOVAL_COSTS[type];

            if (!removal) return;

            console.log(removal);

            const cost = area * removal.removalRate;

            totalRemoval +=
             Math.max(cost, removal.minRemoval);
        });

        return totalRemoval
    }

    function reset() {
        setStep("roomsInput")
        setRoomInput({ width: 0, length: 0});
    }

    function roomCheck(){
        console.log(quote)
    }

    function piecesCheck(){

        const pieces = splitRoomsIntoPieces(quote.rooms);

        const {
            fullWidthPieces,
            partialPieces
        } = separatePieces(pieces);

        const sortedPieces = sortPieces(partialPieces);

        const partialStrips = buildStrips(sortedPieces);

        const optimizedStrips = optimizeStrips(sortedPieces);

        const product = calculateProduct(fullWidthPieces, optimizedStrips);

        console.log("Original Pieces");
        console.log(pieces);

        console.log("Full Width Pieces")
        console.log(fullWidthPieces)

        console.log("Sorted Pieces");
        console.log(sortedPieces);

        console.log("Partial Strips")
        console.log(partialStrips)

        console.log("Optimized Strips")
        console.log(optimizedStrips)

        console.log("Product Info")
        console.log("Total Length: " + product.totalLength);
        console.log("Total Sqft: " + product.totalSqFt);
        console.log("Strips:");
        console.log(product.strips);
        console.log("Full Pieces:");
        console.log(product.fullWidthPieces);

    }


    return (
        <>
            <button
                onClick={() => setPage("floorSelection")}
                className="fixed w-40 h-14 top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 font-semibold transition"
            >
                Flooring Selection
            </button>

            <button
                className="fixed w-40 h-14 top-20 right-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg font-semibold transition"
                onClick={() => setScannerOpen(true)}
            >
                Scan Product
            </button>

            <button
                className="fixed w-40 h-14 top-36 right-4 bg-yellow-400 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg font-semibold transition"
                onClick={(roomCheck)}
            >
                Room Check
            </button>

            <button
                className="fixed w-40 h-14 top-52 right-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg font-semibold transition"
                onClick={(piecesCheck)}
            >
                Pieces Check
            </button>
            
            {scannerOpen && (
                <ScannerModal
                    onClose={() => setScannerOpen(false)}
                    onSelect={(item) => {
                        setScannedItem(item);
                        setScannerOpen(false)
                    }}
                />
            )}

            {step === "roomsInput" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-xl font-bold text-center">
                        Enter Room Size (ft)
                    </h1>

                    <input
                        type="number"
                        placeholder="width"
                        value={roomInput.width}
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setRoomInput({
                                ...roomInput,
                                width: parseFloat(e.target.value) || "",
                            })
                        }
                    />

                    <input
                        type="number"
                        placeholder="length"
                        value={roomInput.length}
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setRoomInput({
                                ...roomInput,
                                length: parseFloat(e.target.value) || "",
                            })
                        }
                    />

                    <div className="text-left">
                        {rooms.map((room, i) => (
                            <p key={i}>
                                Room {i + 1}: {room.width} x {room.length}
                            </p>
                        ))}
                    </div>

                    <div className="flex gap-4">
                        <button
                            className="flex-1 py-4 bg-blue-600 text-white rounded-xl"
                            onClick={() => {
                                addRoom({ ...roomInput });
                                setRoomInput({ width: 0, length: 0});
                            }}
                        >
                            Add Another Room
                        </button>

                        <button
                            className="flex-1 py-4 bg-green-600 text-white rounded-xl"
                            disabled={rooms.length === 0}
                            onClick={() => {
                                console.log("Button clicked")

                                const material = getProductData();

                                console.log(material);

                                setQuote(prev => ({
                                    ...prev,
                                    material: material
                                }));

                                console.log("Setting Step")

                                setStep("roomQuantity");
                            }}
                        >
                            That's All
                        </button>
                    </div>
                </div>
            )}

            {step === "roomQuantity" && (
                <div className="relative w-[800px] bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">

                    <div className="absolute top-8 right-8 w-50 bg-gray-100 rounded-xl shadow-lg p-4 text-left">
                        <h3 className="font-bold text-lg mb-3">
                            Cutting Plan
                        </h3>

                        {material?.cuts?.map((cut, index) => (
                            <div
                                key={index}
                                className="bg-white rounded-lg p-2 shadow mb-2"
                            >
                                <p className="font-semibold">
                                    Cut {index + 1}: {cut.cutLength}ft
                                </p>
                            </div>
                        ))}
                    </div>
                    <h2 className="text-3xl font-bold text-center">
                        Total square footage
                    </h2>

                    <p>
                        Including waste
                    </p>

                    <p className="text-5xl font-bold text-blue-600">
                        {material?.totalSqft} sqft
                    </p>


                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={reset}
                    >
                        Start Over
                    </button>

                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => setStep("roomProductInfo")}
                    >
                        Calculate Cost
                    </button>
                </div>
            )}

            {step === "roomProductInfo" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        Are we installing?
                    </h1>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setQuote(prev => ({
                                    ...prev,
                                    roomInstall: false
                                }))
                                setStep("roomCost")
                            }}
                        >
                            Just Product
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setQuote(prev => ({
                                    ...prev,
                                    roomInstall: true
                                }))
                                setStep("roomRemoval")
                            }}
                        >
                            Install Costs
                        </button>
                    </div>
                </div>
            )}

            {step === "roomRemoval" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center1">
                        Is there removal?
                    </h1>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setQuote(prev => ({
                                    ...prev,
                                    roomRemoval: true
                                }))
                                setStep("removalDetails")
                            }}
                        >
                            Yes
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setQuote(prev => ({
                                    ...prev,
                                    roomRemoval: false
                                }))
                                setStep("roomCost")
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {step === "removalDetails" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-2xl font-bold">
                        What flooring is being removed in each room?
                    </h1>

                    <div className="mb-6">
                        <p className="font-semibold mb-2"> Removal Type (All Rooms)</p>

                        <select
                            value={globalRemovalType}
                            onChange={(e) => 
                                setQuote(prev => ({
                                    ...prev,
                                    globalRemovalType: (e.target.value)
                                }))
                            }
                            className="border p-2 rounded-lg w-full"
                        >
                            <option value="">Select Type</option>
                            <option value="carpet">Carpet</option>
                            <option value="vinylClick">Vinyl Click</option>
                            <option value="vinylGlue">Vinyl Glue</option>
                            <option value="laminate">Laminate</option>
                            <option value="hardwood">Hardwood</option>
                            <option value="tile">Tile</option>
                        </select>
                    </div>

                    <div className="space-y-4 text-left">
                        {rooms.map((room, index) => (
                            <div
                                key={index}
                                className="flex justify-between items-center bg-gray-100 p-4 rounded-xl"
                            >
                                <p>
                                    Room {index + 1}: {room.width} x {room.length}
                                </p>

                                <select
                                    className="border p-2 rounded-lg w-full"
                                    value={globalRemovalType || room.removalType}
                                    disabled={!!globalRemovalType}
                                    onChange={(e) => {
                                        setQuote(prev => {
                                            const updatedRooms = [...prev.rooms];
                                            updatedRooms[index] = {
                                                ...updatedRooms[index],
                                                removalType: e.target.value
                                            };

                                            return {
                                                ...prev,
                                                rooms: updatedRooms
                                            };
                                        });
                                    }}
                                 >
                                    <option value="">Select Type</option>
                                    <option value="carpet">Carpet</option>
                                    <option value="vinylClick">Vinyl Click</option>
                                    <option value="vinylGlue">Vinyl Glue</option>
                                    <option value="laminate">Laminate</option>
                                    <option value="hardwood">Hardwood</option>
                                    <option value="tile">Tile</option>
                                </select>
                            </div>
                        ))}
                    </div>

                    <button
                        className="w-full py-4 bg-blue-600 text-white rounded-xl"
                        onClick={() => setStep("roomCost")}
                    >
                        Continue
                    </button>
                </div>
            )}

            {step === "roomCost" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold">
                        Cost per sq ft
                    </h1>

                    <input
                        type="number"
                        placeholder="$ / sqft"
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setQuote(prev => ({
                                ...prev,
                                roomCost: (parseFloat(e.target.value) || 0)
                            }))
                        }
                    />

                    <button
                        className="w-full py-4 bg-blue-600 text-white rounded-xl"
                        onClick={calculateRoomTotal}
                    >
                        Calculate
                    </button>
                </div>
            )}


            {step === "roomResult" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h2 className="text-2xl font-semibold">
                        Room Total
                    </h2>
                    {(numberOfBoxes ?? 0) > 1 && (
                        <p>
                            Number of Cartons: {numberOfBoxes} Cartons
                        </p>
                    )}

                    <p className="text-5xl font-bold text-green-600">
                        {roomTotal?.toLocaleString("en-CA", {
                            style: "currency",
                            currency: "CAD"
                        })}
                    </p>

                    <button
                        className="w-full py-4 bg-blue-600 text-white rounded-xl"
                        onClick={reset}
                    >
                        Main Menu
                    </button>
                </div>
            )}

        </>
    )
}