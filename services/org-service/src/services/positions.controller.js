const positionsService = require("./positions.service");

async function createPosition(req, res, next) {
  try {
    const position = await positionsService.createPosition(req.tenantId, req.body, req.auth);
    res.status(201).json(position);
  } catch (error) {
    next(error);
  }
}

async function listPositions(req, res, next) {
  try {
    const positions = await positionsService.listPositions(req.tenantId);
    res.status(200).json(positions);
  } catch (error) {
    next(error);
  }
}

async function updatePosition(req, res, next) {
  try {
    const position = await positionsService.updatePosition(req.tenantId, req.params.positionId, req.body, req.auth);
    res.status(200).json(position);
  } catch (error) {
    next(error);
  }
}

async function getSubtree(req, res, next) {
  try {
    const subtree = await positionsService.getSubtree(req.tenantId, req.params.positionId);
    res.status(200).json(subtree);
  } catch (error) {
    next(error);
  }
}

async function deletePositions(req, res, next) {
  try {
    const result = await positionsService.deletePositions(req.tenantId, req.body.positionIds, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createPosition,
  listPositions,
  updatePosition,
  getSubtree,
  deletePositions,
};
