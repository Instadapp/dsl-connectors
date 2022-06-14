//SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

import { InstaConnectors } from "../../common/interfaces.sol";

contract SwapHelpers {
	/**
	 * @dev Instadapp Connectors Registry
	 */
	InstaConnectors internal constant instaConnectors =
		InstaConnectors(0x2A00684bFAb9717C21271E0751BCcb7d2D763c88);

	struct InputData {
		address buyAddr;
		address sellAddr;
		uint256 sellAmt;
		uint256[] unitAmts;
		bytes4[] swapDatas;
		bytes[] callDatas;
		uint256 setId;
	}

	/**
	 *@dev Swap using the dex aggregators.
	 *@param _connectors name of the connectors in preference order.
	 *@param _inputData data for the swap cast.
	 */
	function _swap(string[] memory _connectors, InputData memory _inputData)
		internal
		returns (bool success, bytes memory returnData)
	{
		uint256 _length = _connectors.length;
		require(_length > 0, "zero-length-not-allowed");
		require(
			_inputData.unitAmts.length == _length,
			"unitAmts-length-invalid"
		);
		require(
			_inputData.callDatas.length == _length,
			"callDatas-length-invalid"
		);
		require(
			_inputData.swapDatas.length == _length,
			"swapDatas-length-invalid"
		);

		// require _connectors[i] == "1INCH-A" || "ZEROX-A" || "PARASWAP-A" || similar connectors

		for (uint256 i = 0; i < _length; i++) {
			bytes memory _data = abi.encodeWithSelector(
				_inputData.swapDatas[i],
				_inputData.buyAddr,
				_inputData.sellAddr,
				_inputData.sellAmt,
				_inputData.unitAmts[i],
				_inputData.callDatas[i],
				_inputData.setId
			);

			(success, returnData) = instaConnectors
				.connectors(_connectors[i])
				.delegatecall(_data);
			if (success) {
				break;
			}
		}
	}
}