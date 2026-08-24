import { useState, useRef } from "react";
import ScannerModal from "./ScannerModal";

export default function SampleSignOut({ setMode }) {

  const [scannerOpen, setScannerOpen] = useState(false)

  const [step, setStep] = useState("signOutOptions");

  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    number: "",
    employee: ""
  });

  const [cartItems, setCartItems] = useState([]);
  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState([]);

  const [notFoundBarcode, setNotFoundBarcode] = useState("");
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscDescription, setMiscDescription] = useState("");

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzAcdiYAZOqw4mZj7YX2gF1acPEfZh1aXBEx2YXuVsjPZOTrM9YVEp0WLNgQ3Eif5Dqcg/exec"
  
  async function searchBarcode(forcedBarcode = null) {
    let code = forcedBarcode ?? barcode;

    if (typeof code !== "string") {
      code = barcode;
    }

    code = code.trim();

    if (!code) {
      alert("No barcode entered");
      return;
    }

    if (code === "99999999") {
      setBarcode("")
      setNotFoundBarcode("");
      setMiscOpen(true);
      return;
    }

    try {
      console.log("Searching for:", code);

      const res = await fetch(
        `${SCRIPT_URL}?action=search&barcode=${encodeURIComponent(code)}&t=${Date.now()}`
      );

      const data = await res.json();

      console.log("SEARCH RESULT:", data);

      if (!data || data.length === 0) {
        setNotFoundBarcode(code);
        setBarcode("");
        return;
      }

      if (data.length === 1) {
        addToCart(data[0]);
        return
      }

      setResults(data);
    } catch (err) {
      console.error(err);
      alert("Error Sending Barcode");
    }
  }

  function addToCart(item) {
    setCartItems(prev => {
      if (prev.includes(item)) {
        return prev;
      }

      return [...prev, item];
    })

    setResults([]);
    setBarcode("");
  }

  async function signOut() {
    if (!cartItems.length) {
      alert("Cart is empty");
      return;
    }

    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "signout",
          customerInfo,
          items: cartItems
        })
      });

      const data = await res.json();
      console.log("SCRIPT RESPONSE:", data);

      if (!data.success) {
        throw new Error(data.error || "Unknown Error");
      }

      alert("Samples Signed Out");

      setCartItems([]);
      setCustomerInfo({
        name: "",
        number: "",
        employee: ""
      });

      setMode("menu")

    } catch (err) {
      console.error(err);
      alert("Sign out failed ❌");
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-10 space-y-6">

      {step === "signOutOptions" && (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-center">
          Returning or Signing Out?
        </h1>
        <button
          className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
          onClick={() => setStep("info")}
        >
          Sign Out Samples
        </button>

        <button
          className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
          onClick={() => {
            window.open(
              "https://docs.google.com/spreadsheets/d/1VMPWmQUbbHK0JE_8ldfsc2G454vVPkFnLhjATuVKil8/edit?gid=695013411#gid=695013411",
              "_blank"
            );
          }}
        >
          Return Samples
        </button>

        <button
          className="w-full text-xl py-6 bg-gray-400 hover:bg-gray-500 text-black rounded-xl font-semibold transition"
          onClick={() => setMode("menu")}
        >
          Main Menu
        </button>
      </div>
      )}

      {/* INFO STEP */}
      {step === "info" && (
        <>
          <h1 className="text-2xl font-bold text-center">Customer Info</h1>

          <input
            placeholder="Customer Name"
            className="border p-3 w-full"
            onChange={(e) =>
              setCustomerInfo(prev => ({ ...prev, name: e.target.value }))
            }
          />

          <input
            placeholder="Customer Number"
            className="border p-3 w-full"
            onChange={(e) =>
              setCustomerInfo(prev => ({ ...prev, number: e.target.value }))
            }
          />

          <input
            placeholder="Employee Name"
            className="border p-3 w-full"
            onChange={(e) =>
              setCustomerInfo(prev => ({ ...prev, employee: e.target.value }))
            }
          />

          <button
            className="w-full bg-blue-600 text-white p-4 rounded-xl"
            onClick={() => {
              if (!customerInfo.name || !customerInfo.number || !customerInfo.employee) {
                alert("Fill all fields");
                return;
              }

              setStep("search");
            }}
          >
            Proceed
          </button>

          <button
            className="w-full bg-gray-400 p-4 rounded-xl"
            onClick={() => setMode("menu")}
          >
            Back
          </button>
        </>
      )}

      {/* SEARCH STEP */}
      {step === "search" && (
        <>
          <h1 className="text-2xl font-bold text-center">Search Samples</h1>

          <button
            className="bg-gray-500 text-white p-3 rounded-xl"
            onClick={() => setScannerOpen(true)}
          >
            Scan Barcode
          </button>

          <input
            placeholder="Enter Barcode"
            className="border p-3 w-full"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchBarcode();
              }
            }}
          />

          {notFoundBarcode && (
            <div className="border border-red-300 bg-red-50 p-4 rounded-xl space-y-3">
              <p className="font-semibold">
                Barcode {notFoundBarcode} was not found.
              </p>

              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-xl"
                onClick={() => setMiscOpen(true)}
              >
                Add as Unlisted Sample
              </button>

              <button
                className="bg-gray-400 px-4 py-2 rounded-xl ml-2"
                onClick={() => setNotFoundBarcode("")}
              >
                Cancel
              </button>
            </div>
          )}

          <button
            className="bg-blue-600 text-white p-3 rounded-xl"
            onClick={() => searchBarcode(barcode)}
          >
            Search
          </button>

          <button
            className="bg-yellow-500 text-black p-3 rounded-xl"
            onClick={() => {
              setNotFoundBarcode("");
              setMiscOpen(true);
            }}
          >
            Add Unlisted Sample
          </button>

          {/* RESULTS */}
          {results.map((item, i) => (
            <div key={i} className="border p-3 rounded">
              {item}
              <button
                className="ml-4 bg-blue-500 text-white px-2 py-1 rounded"
                onClick={() => addToCart(item)}
              >
                Add
              </button>
            </div>
          ))}

          {/* CART */}
          <h3 className="font-bold">Cart</h3>

          {cartItems.map((item, i) => (
            <div key={i} className="flex justify-between border p-2 rounded">
              <span>{item}</span>
              <span
                className="text-red-500 cursor-pointer"
                onClick={() =>
                  setCartItems(prev =>
                    prev.filter((_, index) => index !== i)
                  )
                }
              >
                ✕
              </span>
            </div>
          ))}

          <button
            className="w-full bg-green-600 text-white p-4 rounded-xl"
            onClick={signOut}
          >
            Sign Out
          </button>

          <button
            className="w-full bg-gray-400 p-4 rounded-xl"
            onClick={() => setStep("info")}
          >
            Back
          </button>

          {scannerOpen && (
            <ScannerModal
              onClose={() => setScannerOpen(false)}
              onSelect={(item) => {
                const scannedCode = 
                  item.Barcode || 
                  item.barcode || 
                  item["Barcode"] ||
                  item["Item Code"];

                if (!scannedCode) {
                  alert("No barcode found on item");
                  return;
                }

                setBarcode(scannedCode);
                setScannerOpen(false);
                searchBarcode(scannedCode);
              }}
            />
          )}

          {miscOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">

                <h3 className="text-xl font-bold text-center">
                  Add Unlisted Sample
                </h3>

                {notFoundBarcode && (
                  <p className="text-center">
                    Barcode: <strong>{notFoundBarcode}</strong>
                  </p>
                )}

                <input
                  type="text"
                  placeholder="Enter Sample Description"
                  className="border p-3 w-full rounded"
                  value={miscDescription}
                  onChange={(e) => setMiscDescription(e.target.value)}
                  autoFocus
                />

                <div className="flex gap-3">

                  <button
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-xl"
                    onClick={() => {
                      if (!miscDescription.trim()) {
                        alert("Enter a sample description");
                        return;
                      }

                      const miscItem = notFoundBarcode
                        ? `UNLISTED - ${notFoundBarcode} - ${miscDescription.trim()}`
                        : `UNLISTED - ${miscDescription.trim()}`
                      
                      addToCart(miscItem);

                      setMiscDescription("");
                      setNotFoundBarcode("");
                      setMiscOpen(false);
                    }}
                  >
                    Add Sample  
                  </button>

                  <button
                    className="flex-1 bg-gray-400 px-4 py-2 rounded-xl ml-2"
                    onClick={() => {
                      setMiscDescription("");
                      setMiscOpen(false);
                    }} 
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}