import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import CryptocartABI from './contracts/Cryptocart.json';
import './App.css';

// 🚨 PASTE YOUR NEWEST CONTRACT ADDRESS HERE 🚨
const CONTRACT_ADDRESS = "0xcf8d3C98bf92A867156481Dc1861725A8C40B991";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("");

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  // NEW: State to hold the physical image file
  const [imageFile, setImageFile] = useState(null);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();

        const cryptocartContract = new ethers.Contract(CONTRACT_ADDRESS, CryptocartABI.abi, signer);

        setAccount(accounts[0]);
        setContract(cryptocartContract);
        setStatus("Wallet connected! Fetching store inventory...");
      } catch (error) {
        console.error("Connection failed:", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const fetchAllProducts = async () => {
    if (contract) {
      try {
        const totalProducts = await contract.productCount();
        const loadedProducts = [];

        for (let i = 1; i <= totalProducts; i++) {
          const productData = await contract.products(i);
          loadedProducts.push({
            id: i,
            name: productData.name,
            price: ethers.formatEther(productData.price),
            isDelivered: productData.isDelivered,
            // NEW: Pull the image URL from the blockchain
            imageURI: productData.imageURI
          });
        }
        setProducts(loadedProducts);
        setStatus("");
      } catch (error) {
        console.error("Failed to fetch products:", error);
      }
    }
  };

  useEffect(() => {
    fetchAllProducts();
  }, [contract]);

  // --- UPDATED: Upload Image to IPFS using JWT ---
  const uploadToIPFS = async () => {
    if (!imageFile) return null;

    try {
      const formData = new FormData();
      formData.append("file", imageFile);

      const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        headers: {
          // The modern Bearer Token authorization method!
          'Authorization': `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
          "Content-Type": "multipart/form-data"
        }
      });

      return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
    } catch (error) {
      console.error("Error uploading image to Pinata:", error);
      throw new Error("Image upload failed");
    }
  };

  // --- UPDATED: Add Product ---
  const addProduct = async (e) => {
    e.preventDefault();
    if (contract && newName && newPrice && imageFile) {
      try {
        setStatus("1/2: Uploading image to IPFS... (This takes a few seconds)");

        // 1. Upload to IPFS first
        const imageURI = await uploadToIPFS();

        setStatus("2/2: Waiting for MetaMask to approve adding product...");
        const priceInWei = ethers.parseEther(newPrice);

        // 2. Send the Name, Price, AND Image URL to the blockchain!
        const tx = await contract.addProduct(newName, priceInWei, imageURI);

        setStatus("Transaction sent! Adding product to the blockchain...");
        await tx.wait();

        setStatus(`🎉 Success! "${newName}" added to the store.`);
        setNewName("");
        setNewPrice("");
        setImageFile(null); // Clear the file input

        fetchAllProducts();
      } catch (error) {
        console.error("Add product failed:", error);
        setStatus("Failed to add product. Check console.");
      }
    } else {
      setStatus("Please fill out all fields and select an image.");
    }
  };

  // ... (buyProduct and confirmDelivery remain exactly the same as before)
  const buyProduct = async (id, priceString) => {
    if (contract) {
      try {
        setStatus(`Waiting for MetaMask to approve purchase of Product #${id}...`);
        const priceInWei = ethers.parseEther(priceString);
        const tx = await contract.buyProduct(id, { value: priceInWei });
        setStatus("Transaction sent! Locking funds in escrow...");
        await tx.wait();
        setStatus(`🎉 Success! Product #${id} is now locked in escrow.`);
        fetchAllProducts();
      } catch (error) {
        console.error("Purchase failed:", error);
        setStatus("Purchase failed. Make sure you aren't the seller!");
      }
    }
  };

  const confirmDelivery = async (id) => {
    if (contract) {
      try {
        setStatus(`Waiting for MetaMask to confirm delivery of Product #${id}...`);
        const tx = await contract.confirmDelivery(id);
        setStatus("Transaction sent! Releasing funds to the seller...");
        await tx.wait();
        setStatus(`💸 Success! Escrow unlocked. Funds transferred to seller.`);
        fetchAllProducts();
      } catch (error) {
        console.error("Confirmation failed:", error);
        setStatus("Confirmation failed. Are you sure you are the buyer?");
      }
    }
  };

  return (
    <div className="App">
      <h1>🛒 Cryptocart: Web3 Edition</h1>

      {!account ? (
        <button onClick={connectWallet} className="connect-btn">
          🦊 Connect MetaMask
        </button>
      ) : (
        <div className="dashboard">
          <p className="wallet-text">Connected: <code>{account.slice(0, 6)}...{account.slice(-4)}</code></p>

          {status && <p className="status-message">{status}</p>}

          <div className="add-product-section">
            <h3>Sell an Item</h3>
            <form onSubmit={addProduct} className="add-form">
              <input
                type="text"
                placeholder="Product Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Price in ETH"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
              />
              {/* NEW: Image Upload Input */}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files[0])}
                required
                className="file-input"
              />
              <button type="submit" className="add-btn">Add to Blockchain</button>
            </form>
          </div>

          <hr />

          <div className="store-grid">
            {products.map((item) => (
              <div key={item.id} className="product-card">
                {/* NEW: Render the IPFS Image */}
                <img src={item.imageURI} alt={item.name} className="product-image" />

                <h2>{item.name}</h2>
                <p>ID: #{item.id}</p>
                <p>Price: <strong>{item.price} ETH</strong></p>
                <p>Status: {item.isDelivered ? "✅ Delivered" : "📦 Pending / Escrow"}</p>

                {!item.isDelivered && (
                  <div className="button-group">
                    <button onClick={() => buyProduct(item.id, item.price)} className="buy-btn">
                      Buy
                    </button>
                    <button onClick={() => confirmDelivery(item.id)} className="confirm-btn">
                      Confirm Delivery
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}

export default App;