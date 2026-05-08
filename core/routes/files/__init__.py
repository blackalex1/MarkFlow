from fastapi import APIRouter
from .tree import router as tree_router
from .content import router as content_router
from .actions import router as actions_router
from .images import router as images_router

router = APIRouter()

router.include_router(tree_router)
router.include_router(content_router)
router.include_router(actions_router)
router.include_router(images_router)
