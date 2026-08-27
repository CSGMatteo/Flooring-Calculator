import React, { useState } from "react";
import ScannerModal from "./ScannerModal";
import Maintenance from "./Maintenance";
import VinylClickRoom from "./RoomCalculators/VinylClickRoom";
import VinylGlueRoom from "./RoomCalculators/VinylGlueRoom";
import LaminateRoom from "./RoomCalculators/LaminateRoom";
import HardwoodRoom from "./RoomCalculators/HardwoodRoom";
import VinylSheetRoom from "./RoomCalculators/VinylSheetRoom";

export default function RoomCalculator({ setMode }) {
    const [page, setPage] = useState("floorSelection")

    const [quote, setQuote] = useState({
        floortype: "",
        rooms: [],
        boxsqft: 0,
        numberOfBoxes: 0,
        roomCost: 0,
        roomInstall: false,
        roomRemoval: false,
        roomTotal: 0,
        globalRemovalType: "",
        extras: [],
        totals: {},
        material: {
            totalLength: 0,
            totalSqft: 0,
            strips: [],
            fullWidthPieces: [],
        }
    })

    
    const [scannerOpen, setScannerOpen] = useState(false)
    const [scannedItem, setScannedItem] = useState(null)

    function resetRoom() {
        setMode("mainMenu");
    }

    function roomCheck(){
        console.log(quote)
    }

    function roomClear(){
        setQuote({
            floortype: "",
            rooms: [],
            boxsqft: 0,
            numberOfBoxes: 0,
            roomCost: 0,
            roomInstall: false,
            roomRemoval: false,
            roomTotal: 0,
            globalRemovalType: "",
            extras: [],
            totals: {}
        })
    }

    return (
        <>
            <button
                onClick={resetRoom}
                className="fixed w-40 h-14 top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 font-semibold transition"
            >
                Main Menu
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

            {scannerOpen && (
                <ScannerModal
                    onClose={() => setScannerOpen(false)}
                    onSelect={(item) => {
                        setScannedItem(item);
                        setScannerOpen(false)
                    }}
                />
            )}

            {page === "floorSelection" && (
                <>
                <button
                    className="fixed w-40 h-14 top-52 right-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg font-semibold transition"
                    onClick={(roomClear)}
                >
                    Room Clear
                </button>

                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-xl font-bold text-center">
                        What flooring is being put in?
                    </h1>

                    <div className="grid grid-cols-3 gap-4">
                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setPage("vinylClickRoom")
                            }}
                        >
                            Vinyl Click
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setPage("vinylGlueRoom")
                            }}
                        >
                            Vinyl Glue
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setPage("vinylSheetRoom")
                            }}
                        >
                            Vinyl Sheet
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setPage("laminateRoom")
                            }}
                        >
                            Laminate
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setPage("hardwoodRoom")
                            }}
                        >
                            Hardwood
                        </button>

                        <button
                            className="py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setMode("maintenance")
                            }}
                        >
                            Carpet
                        </button>

                        <button
                            className="col-start-2 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                            onClick={() => {setMode("maintenance")
                            }}
                        >
                            Tile
                        </button>
                    </div>
                </div>
                </>
            )}

            {page === "vinylClickRoom" && (
                <VinylClickRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}

            {page === "vinylGlueRoom" && (
                <VinylGlueRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}
            
            {page === "vinylSheetRoom" && (
                <VinylSheetRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}

            {page === "laminateRoom" && (
                <LaminateRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}

            {page === "hardwoodRoom" && (
                <HardwoodRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}

            {page === "carpetRoom" && (
                <carpetRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}

            {page === "tileRoom" && (
                <tileRoom
                    quote={quote}
                    setQuote={setQuote}
                    setMode={setMode}
                    setPage={setPage}
                />
            )}
        </>
    )
}