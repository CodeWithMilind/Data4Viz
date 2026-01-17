"""Main FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.cleaning import router as cleaning_router
from app.api.datasets import router as datasets_router
from app.api.workspaces import router as workspaces_router
from app.api.overview import router as overview_router

from app.config import ALLOWED_ORIGINS

app = FastAPI(
    title="Data4Viz Backend API",
    description="Backend API for workspace-driven data cleaning operations",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Include routers
# IMPORTANT: Workspace router must be included for workspace-aware operations
app.include_router(workspaces_router)
app.include_router(cleaning_router)
app.include_router(datasets_router)  # Legacy endpoint for backward compatibility
app.include_router(overview_router, prefix="/api")




@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Data4Viz Backend API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
