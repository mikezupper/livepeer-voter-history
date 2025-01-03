import React, {Suspense} from 'react';
import ReactDOM from 'react-dom/client';
import {createBrowserRouter, RouterProvider,createRoutesFromElements,Route} from 'react-router-dom';
import App from './App';
import {CircularProgress} from "@mui/material";
import DataServices from "./apis/DataServices.js";
import VotingHistoryList from "./VotingHistoryList.jsx";

//load reference data
const proposalLoader=async () => {
    console.log(`[index] proposalLoader loading...`);

    await DataServices.init();

    const proposals = await DataServices.getProposals();
    // Convert proposals object to an array of [proposalId, proposalData]
    let proposalEntries = Object.values(proposals);
    // Sort by timestamp (descending)
    proposalEntries.sort((a, b) => b.createdAt - a.createdAt);

    console.log(`[index] proposalLoader completed.`);
    return {proposals,proposalList:proposalEntries};
}

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route path="/" element={<App />}>
            <Route
                index
                element={<VotingHistoryList />}
                loader={proposalLoader}
                hydrateFallbackElement={<CircularProgress />}
            />
        </Route>
    )
);
ReactDOM.createRoot(document.getElementById('root')).render(<RouterProvider router={router} />);
