import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import CryptocartABI from './contracts/Cryptocart.json';
import './App.css';

// 🚨 KEEP YOUR EXISTING CONTRACT ADDRESS HERE 🚨
const CONTRACT_ADDRESS = "0xcf8d3C98bf92A867156481Dc1861725A8C40B991";

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null); // The Read/Write Contract (MetaMask)
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("");

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // --- NEW: THE AUTO-LOAD FUNCTION ---
  const fetchAllProducts = async () => {
    try {
      // 1. Create a Read-Only connection using your Alchemy Private RPC!
      const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
      const readOnlyProvider = new ethers.JsonRpcProvider(rpcUrl);
      const readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, CryptocartABI.abi, readOnlyProvider);

      // 2. Fetch from the Blockchain (Lightning Fast now!)
      const totalProducts = await readOnlyContract.productCount();
      const loadedChainProducts = [];

      for (let i = 1; i <= totalProducts; i++) {
        const productData = await readOnlyContract.products(i);
        loadedChainProducts.push({
          id: i,
          name: productData.name,
          price: ethers.formatEther(productData.price),
          isDelivered: productData.isDelivered,
          imageURI: productData.imageURI
        });
      }

      // 3. Fetch from Supabase
      const { data: dbProducts, error } = await supabase.from('products').select('*');
      if (error) console.error("Supabase fetch error:", error);

      // 4. Merge Data
      const mergedProducts = loadedChainProducts.map(chainProd => {
        const dbInfo = dbProducts?.find(db => db.blockchain_id === chainProd.id) || {};
        return {
          ...chainProd,
          category: dbInfo.category || "Uncategorized",
          description: dbInfo.description || "No description provided."
        };
      });

      setProducts(mergedProducts);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  };

  // --- NEW: Run instantly on page load! ---
  // Notice the empty array [] at the end. It no longer waits for `contract`.
  useEffect(() => {
    fetchAllProducts();
  }, []);


  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();

        // This is the Read/Write contract that allows spending money
        const cryptocartContract = new ethers.Contract(CONTRACT_ADDRESS, CryptocartABI.abi, signer);

        setAccount(accounts[0]);
        setContract(cryptocartContract);
        setStatus("Wallet connected securely!");
      } catch (error) {
        console.error("Connection failed:", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const uploadToIPFS = async () => {
    if (!imageFile) return null;
    try {
      const formData = new FormData();
      formData.append("file", imageFile);
      const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
          "Content-Type": "multipart/form-data"
        }
      });
      return `https://green-actual-mackerel-191.mypinata.cloud/ipfs/${res.data.IpfsHash}`;
    } catch (error) {
      console.error("Error uploading image to Pinata:", error);
      throw new Error("Image upload failed");
    }
  };

  const addProduct = async (e) => {
    e.preventDefault();
    if (contract && newName && newPrice && imageFile) {
      try {
        setStatus("1/3: Uploading image to IPFS...");
        const imageURI = await uploadToIPFS();

        setStatus("2/3: Waiting for MetaMask...");
        const priceInWei = ethers.parseEther(newPrice);
        const tx = await contract.addProduct(newName, priceInWei, imageURI);

        setStatus("Transaction sent! Writing to Ethereum...");
        await tx.wait();

        setStatus("3/3: Saving rich metadata to Supabase...");
        const newTotalCount = await contract.productCount();
        const newProductId = Number(newTotalCount);

        const { error: dbError } = await supabase.from('products').insert([
          { blockchain_id: newProductId, category: newCategory, description: newDescription }
        ]);

        if (dbError) throw dbError;

        setStatus(`🎉 Success! "${newName}" added to the Web2.5 store.`);
        setNewName(""); setNewPrice(""); setImageFile(null); setNewCategory(""); setNewDescription("");

        fetchAllProducts(); // Refresh the store
      } catch (error) {
        console.error("Add product failed:", error);
        setStatus("Failed to add product. Check console.");
      }
    } else {
      setStatus("Please connect wallet and fill out all fields.");
    }
  };

  const buyProduct = async (id, priceString) => {
    // NEW: Check if wallet is connected before allowing purchase!
    if (!contract) {
      alert("Please connect your wallet at the top of the page to buy items!");
      return;
    }
    try {
      setStatus(`Waiting for MetaMask to approve purchase...`);
      const priceInWei = ethers.parseEther(priceString);
      const tx = await contract.buyProduct(id, { value: priceInWei });
      setStatus("Locking funds in escrow...");
      await tx.wait();
      setStatus(`🎉 Success! Product #${id} is now locked in escrow.`);
      fetchAllProducts();
    } catch (error) {
      setStatus("Purchase failed. Make sure you aren't the seller!");
    }
  };

  const confirmDelivery = async (id) => {
    if (!contract) return;
    try {
      setStatus(`Waiting for MetaMask to confirm delivery...`);
      const tx = await contract.confirmDelivery(id);
      setStatus("Releasing funds to the seller...");
      await tx.wait();
      setStatus(`💸 Success! Escrow unlocked.`);
      fetchAllProducts();
    } catch (error) {
      setStatus("Confirmation failed. Are you sure you are the buyer?");
    }
  };

  return (
    <div className="App">
      <h1>🛒 Cryptocart: Web2.5 Edition</h1>

      {/* Wallet Connection / Dashboard Section */}
      {!account ? (
        <div className="wallet-prompt">
          <button onClick={connectWallet} className="connect-btn">🦊 Connect MetaMask to Sell</button>
          <p style={{ marginTop: "10px", color: "#94a3b8" }}>You can browse the store below without connecting!</p>
        </div>
      ) : (
        <div className="dashboard">
          <p className="wallet-text">Connected: <code>{account.slice(0, 6)}...{account.slice(-4)}</code></p>
          {status && <p className="status-message">{status}</p>}

          <div className="add-product-section">
            <h3>Sell an Item</h3>
            <form onSubmit={addProduct} className="add-form">
              <input type="text" placeholder="Product Name*" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <input type="number" step="0.0001" placeholder="Price in ETH*" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} required />
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} required className="file-input" />
              <input type="text" placeholder="Category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <textarea placeholder="Rich Description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows="3" className="text-area-input" />
              <button type="submit" className="add-btn">Add to Web2.5 Store</button>
            </form>
          </div>
        </div>
      )}

      <hr style={{ margin: "40px 0", borderColor: "rgba(255,255,255,0.1)" }} />

      {/* --- NEW: THE PUBLIC STOREFRONT --- */}
      {/* This is now outside the wallet check. Everyone can see it! */}
      <h2>Live Public Storefront</h2>
      <div className="store-grid">
        {products.length === 0 ? <p>Loading products from the blockchain...</p> : null}

        {products.map((item) => (
          <div key={item.id} className="product-card">
            <img src={item.imageURI} alt={item.name} className="product-image" />
            <span className="category-badge">{item.category}</span>
            <h2>{item.name}</h2>
            <p className="description-text">{item.description}</p>

            <p>ID: #{item.id} | Price: <strong>{item.price} ETH</strong></p>
            <p>Status: {item.isDelivered ? "✅ Delivered" : "📦 Pending / Escrow"}</p>

            {!item.isDelivered && (
              <div className="button-group">
                {/* Clicking buy checks if they are logged in inside the function */}
                <button onClick={() => buyProduct(item.id, item.price)} className="buy-btn">Buy</button>
                <button onClick={() => confirmDelivery(item.id)} className="confirm-btn">Confirm Delivery</button>
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

export default App;