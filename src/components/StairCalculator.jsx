import React, { useState } from "react";
import ScannerModal from "./ScannerModal";

export default function StairCalculator({ setMode }) {

    
    const PIECE_TYPES = {
        box: { w:3, h: 1.75 },
        open1: { w: 4, h: 1.75 },
        open2: { w: 6, h: 1.75 },
        pie: { w: 4, h: 3 },
        curved: { w: 4, h: 2.50 }
    };

    const INSTALL_COSTS = {
        box: { normal : 12, runner: 15 },
        open1: { normal : 18, runner: 15 },
        open2: { normal : 30, runner: 15 },
        pie: { normal : 18, runner: 25 },
        curved: { normal : 30, runner: 25 },
    };

    const ROLL_WIDTH = 12;

    const minStairInstallCost = 300;
    const minStairRemovalCost = 125;

    const padcost = 0.85

    function calculateLength(pieces, landingHeight = 0) {
        const GRID = 0.25;
        const WIDTH = Math.floor(ROLL_WIDTH / GRID);
        const HEIGHT = 500;

        const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));

        const toGrid = (v) => Math.round(v / GRID);

        function canPlace(x, y, w, h) {
            for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) {
                    if (grid[y + dy]?.[x + dx] === 1) return false;
                }
            }

            const remainingWidth = WIDTH - (x + w);

            if (remainingWidth > 0 && remainingWidth < w * 0.6) {
                return false;
            }

            return true;
        }

        function place(x, y, w, h) {
            for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx <w; dx++) {
                    grid[y + dy][x + dx] = 1;
                }
            }
        }

        function findSpot(w, h) {
            for (let y = landingHeight / GRID; y < HEIGHT; y++) {
                for (let x = 0; x <= WIDTH - w; x++) {
                    if (canPlace(x, y, w, h)) return { x, y };
                }
            }

            for (let y = 0; y < landingHeight / GRID; y++) {
                for (let x = 0; x <= WIDTH - w; x++) {
                    if (canPlace(x, y, w, h)) return { x, y };
                }
            }
            return null;
        }

        let maxY = 0;

        // Sort largest first
        pieces.sort((a, b) => (b.h * b.w) - (a.h * a.w));

        for (const p of pieces) {
            const w = toGrid(p.w);
            const h = toGrid(p.h);

            const spot = findSpot(w, h);
            if (!spot) continue;

            place(spot.x, spot.y, w, h);
            maxY = Math.max(maxY, spot.y + h);
        }

        return maxY * GRID;
    }

    const [step, setStep] = useState("StairCalc")

    const formatMoney = (value) =>
        value?.toLocaleString("en-CA", {
            style: "currency",
            currency: "CAD"
        });

    const [scannerOpen, setScannerOpen] = useState(false)
    const [scannedItem, setScannedItem] = useState(false)

    const [result, setResult] = useState(null)

    //Carpet Function Constants

    const [landing, setLanding] = useState(false);
    const [landingSize, setLandingSize] = useState({ w: 0, h: 0 });
    const [cost, setCost] = useState(null);
    const [removal, setRemoval] = useState(false);
    const [install, setInstall] = useState(false);
    const [carpetTotal, setCarpetTotal] = useState(null);
    const [installTotal, setInstallTotal] = useState(null);
    const [grandTotal, setGrandTotal] = useState(null);
    const [wallWall, setwallWall] = useState(false);
    const [runner, setRunner] = useState(false);
    const [runnerLanding, setRunnerLanding] = useState(null);
    const [padTotal, setPadTotal] = useState(null);
    const [rWidth, setRWidth] = useState(null)
    const [patRepeatSize, setPatRepeatSize] = useState(null)
    const [patRepeat, setPatRepeat] = useState(false)
    const [bindingTotal, setBindingTotal] = useState(0)

    const [counts, setCounts] = useState({
        box: 0,
        open1: 0,
        open2: 0,
        pie: 0,
        curved: 0
    });

    //Carpet Stair Logic

    function calcrunnerwidth() {
        let rwidth = 0

        if (patRepeatSize > 0) {
            rwidth = Math.ceil(rWidth / patRepeatSize) * patRepeatSize
        } else {
            rwidth = rWidth}
        
        rwidth = rwidth / 12

        console.log("The Runner Width Will Be:", rwidth)

        setRWidth(rwidth)
        setStep("landing")
    }

    function buildPieces() {
        const pieces = [];

        const RUNNER_PIECE_TYPES = {
            rbox: { w: rWidth, h: 1.75 },
            ropen1: { w: rWidth, h: 1.75 },
            ropen2: { w: rWidth, h: 1.75 },
            rpie: { w: rWidth, h: 3 },
            rcurved: { w: rWidth, h: 2.50 }
        };
        let landingHeight = 0

        if (landing) {
            landingHeight = landingSize.h;
        }

        if (landing) {
            pieces.push({ w: landingSize.w, h: landingSize.h });
        }

        if (runner) {
            for (let i = 0; i < counts.box; i++) pieces.push(RUNNER_PIECE_TYPES.rbox);
            for (let i = 0; i < counts.open1; i++) pieces.push(RUNNER_PIECE_TYPES.ropen1);
            for (let i = 0; i < counts.open2; i++) pieces.push(RUNNER_PIECE_TYPES.ropen2);
            for (let i = 0; i < counts.pie; i++) pieces.push(RUNNER_PIECE_TYPES.rpie);
            for (let i = 0; i < counts.curved; i++) pieces.push(RUNNER_PIECE_TYPES.rcurved);
        } else {
           for (let i = 0; i < counts.box; i++) pieces.push(PIECE_TYPES.box);
           for (let i = 0; i < counts.open1; i++) pieces.push(PIECE_TYPES.open1);
           for (let i = 0; i < counts.open2; i++) pieces.push(PIECE_TYPES.open2);
           for (let i = 0; i < counts.pie; i++) pieces.push(PIECE_TYPES.pie);
           for (let i = 0; i < counts.curved; i++) pieces.push(PIECE_TYPES.curved); 
        }
        return pieces;
    }

    function runCalculation() {
        const pieces = buildPieces();

            let best = Infinity;

            // 1. Try width-first
            let sortedByWidth = [...pieces].sort((a, b) => b.w - a.w);
            let len1 = calculateLength(sortedByWidth);
            if (len1 < best) best = len1;

            // 2. Try height-first
            let sortedByHeight = [...pieces].sort((a,b) => b.h - a.h);
            let len2 = calculateLength(sortedByHeight);
            if (len2 < best) best = len2;

            // 3. Try MANY random layouts
            for (let i = 0; i < 100; i++) {
                let shuffled = [...pieces].sort(() => Math.random() - 0.5);
                let len = calculateLength(shuffled);
                if (len < best) best = len;
            }

            setResult(best.toFixed(2));
            setStep("result");
    }

    function getRunnerLength() {
        return (
            (counts.box || 0) * 1.75 +
            (counts.open1 || 0) * 1.75 +
            (counts.open2 || 0) * 1.75 +
            (counts.pie || 0) * 3 +
            (counts.curved || 0) * 2.5
        );
    }

    function getLandingPerimeter() {
        if (landing) {
            const w = parseFloat(landingSize.w) || 0;
            const h = parseFloat(landingSize.h) || 0;
            return (2 * (w + h));
        } else {
            return (0);
        }
    }

    function BindingCalc() {
        const BindingCost = 1.5

        return runner
            ? (getLandingPerimeter() + (getRunnerLength() * 2)) * BindingCost
            : 0;
    }

    function getInstallCost(key) {
        return runner
            ? INSTALL_COSTS[key].runner
            : INSTALL_COSTS[key].normal;
    }

    function CostCalculation() {
        let carpetTotal = (parseFloat(result || 0) * ROLL_WIDTH) * parseFloat(cost || 0);
        let installTotal = 0;
        let padTotal = (parseFloat(result || 0) * ROLL_WIDTH) * padcost

        if (install) {
            for (let key in counts) {
                const count = counts[key];
                const costPerStep = getInstallCost(key);

                installTotal += count * costPerStep;
            }

            installTotal += minStairInstallCost;

            if (removal) {
                installTotal += minStairRemovalCost;
            }
        }

        const bindingTotal = BindingCalc();

        const grandTotal = parseFloat(
            ((carpetTotal + installTotal + padTotal + bindingTotal) * 1.13).toFixed(2));
        
        // save everything
        setCarpetTotal(carpetTotal);
        setInstallTotal(installTotal);
        setPadTotal(padTotal);
        setGrandTotal(grandTotal);
        setStep("resultinstallcost");

        console.log("Total Binding Cost:", bindingTotal)
        console.log("Total Cost Of Carpet:", carpetTotal)
        console.log("Total Cost of Install Portion:", installTotal)
        console.log("Total Cost Of Pad:", padTotal)
        console.log("RunnerLegth:", getRunnerLength())
        console.log("Landing Perimeter:", getLandingPerimeter())
    }

    function resetStairs() {
        setMode("mainMenu");
        setLanding(false);
        setLandingSize({ w: 0, h: 0 });
        setCost(null);
        setRemoval(false);
        setInstall(false);
        setCarpetTotal(null);
        setInstallTotal(null);
        setGrandTotal(null);
        setwallWall(false);
        setRunner(false)
        setRunnerLanding(null);
        setPadTotal(null);
        setRWidth(null);
        setPatRepeat(false);
        setPatRepeatSize(null);
        setBindingTotal(0)
        setCounts({
            box: 0,
            open1: 0,
            open2: 0,
            pie: 0,
            curved: 0
        });
        setResult(null);
    }

    return (
        <>
            <button
                onClick={resetStairs}
                className="fixed w-40 h-14 top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-600 font-semibold transition"
            >
                Main Menu
            </button>
        
            <button
                className="fixed w-40 h-14 top-20 right-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg font-semibold transition"
                onClick={() => setScannerOpen(true)}
            >
                Scan Product
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

            {step === "StairCalc" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        How will the stairs be carpeted?
                    </h1>

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => {
                            setwallWall(true)
                            setStep("landing")}}
                    >
                        Carpeted Wall to Wall
                    </button>

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold tansition"
                        onClick={() => {
                            setRunner(true)
                            setStep("RunnerWidth")}}
                    >
                        Carpet Runner
                    </button>
                </div>
            )}

            {step === "RunnerWidth" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        What is the desired width of the runner (In)?
                    </h1>

                    <input
                        type="number"
                        placeholder="Runner Width (In)"
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setRWidth(parseFloat(e.target.value) || 0)
                        }
                    />

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => setStep("Pattern")}
                    >
                        Next
                    </button>    
                </div>
            )}

            {step === "Pattern" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        What is the pattern repeat if any?
                    </h1>

                    <input
                        type="number"
                        placeholder="Pattern Repeat"
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setPatRepeatSize(parseFloat(e.target.value) || 0)
                        }
                    />

                    <div className="flex gap-4">
                        <button
                            className="flex-1 text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                calcrunnerwidth();
                            }}
                        >
                            Yes
                        </button>

                        <button
                            className="flex-1 text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                calcrunnerwidth();
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {step === "landing" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h2 className="text-3xl font-bold text-center">
                        Is there a landing?
                    </h2>

                    <div className="flex gap-4">
                        <button
                            className="flex-1 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setLanding(true);
                                if (runner) {
                                    setStep("landingRunner");
                                } else if (wallWall) {
                                    setStep("landingWall");
                                }
                            }}
                        >
                            Yes
                        </button>

                        <button
                            className="flex-1 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setLanding(false);
                                setStep("stairs");
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {step === "landingRunner" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        How much does the landing turn?
                    </h1>

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => {
                            setRunnerLanding(90)
                            setLandingSize({ w: 4, h: 4 })
                            setStep("stairs")
                        }}
                    >
                        90 Degree Turn
                    </button>

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => {
                            setRunnerLanding(180)
                            setLandingSize({ w: 8, h: 4 })
                            setStep("stairs")
                        }}
                    >
                        180 Degree Turn
                    </button>
                </div>
            )}

            {step === "landingWall" && (
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
                    <h2 className="text-2xl font-semibold text-center">
                        Enter Landing Size (ft)
                    </h2>

                    <input
                        type="number"
                        placeholder="Width"
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setLandingSize({
                                ...landingSize,
                                w: parseFloat(e.target.value),
                            })
                        }
                    />

                    <input
                        type="number"
                        placeholder="Length"
                        className="border p-4 w-full text-lg rounded-lg"
                        onChange={(e) =>
                            setLandingSize({
                                ...landingSize,
                                h: parseFloat(e.target.value),
                            })
                        }
                    />

                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => setStep("stairs")}
                    >
                        Next
                    </button>
                </div>
            )}

            {step === "stairs" && (
                <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
                    <h2 className="text-2xl font-semibold text-center">
                        Enter Stair Counts
                    </h2>

                    {[
                        ["box", "Box Steps"],
                        ["open1", "Open 1 Side"],
                        ["open2", "Double Open"],
                        ["pie", "Pie"],
                        ["curved", "Curved"],
                    ].map(([key, label]) => (
                        <div key={key} className="space-y-2">
                            <label className="font-medium">{label}</label>
                            <input
                                type="number"
                                className="w-full p-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-blue-500"
                                onChange={(e) => 
                                    setCounts({
                                        ...counts,
                                        [key]: parseInt(e.target.value) || 0,
                                    })
                                }
                            />
                        </div>
                    ))}

                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={runCalculation}
                    >
                        Calculate
                    </button>
                </div>
            )}

            {step === "result" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h2 className="text-2xl font-semibold">Result</h2>

                    <p className="text-lg">
                        Total Carpet Length Required:
                    </p>

                    <p className="text-5xl font-bold text-blue-600">{result} ft</p>

                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={resetStairs}
                    >
                        Start Over
                    </button>
                    
                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => setStep("IsInstall")}
                    >
                        Calculate Cost
                    </button>
                </div>
            )}

            {step === "IsInstall" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h2 className="text-3xl font-bold text-center">
                        Are we installing it?
                    </h2>

                    <div className="flex gap-4">
                        <button
                            className="flex-1 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setInstall(true);
                                setStep("Removal");
                            }}
                        >
                            Yes
                        </button>

                        <button
                         className="flex-1 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                         onClick={() => {
                            setInstall(false);
                            setStep("Cost");
                         }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {step === "Removal" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h2 className="text-3xl font-bold text-center">
                        Is there removal?
                    </h2>

                    <div className="flex gap-4">
                        <button
                            className="flex-1 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setRemoval(true);
                                setStep("Cost");
                            }}
                        >
                            Yes
                        </button>

                        <button
                            className="flex-1 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {
                                setRemoval(false);
                                setStep("Cost");
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {step === "Cost" && (
                <div className="bg-white rounded-xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        What is the cost of the carpet? ($/sqft)
                    </h1>

                    <input
                     type="number"
                     placeholder="Cost ($/sqft)"
                     className="border p-4 w-full text-lg rounded-lg"
                     onChange={(e) =>
                        setCost(parseFloat(e.target.value) || 0)
                     }
                    />

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={CostCalculation}
                    >
                        Calculate
                    </button>
                </div>
            )}

            {step === "resultinstallcost" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h2 className="text-2xl font-semibold">Approximate Cost</h2>

                    <p className="text-lg">
                        {install
                            ? "Approximate cost of carpet + install (including tax)"
                            : "Approximate cost of carpet"}
                    </p>

                    <p className="text-5xl font-bold text-blue-600">{formatMoney(grandTotal)}</p>

                    <button
                        className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={resetStairs}
                    >
                        Start Over
                    </button>
                </div>
            )}
        </>
    )

}